import type { LabNode, NodeContext, NodeHandler, Packet, ServerConfig } from '../types'
import { enter } from './util'
import { cacheKey, cachePut, initCache, type CacheState } from './cache'
import type { CacheConfig } from '../types'

interface Job {
  packet: Packet
  stage: 'downstream' | 'processing'
  finishAt: number
  waitingOn?: string // the dependency this job is waiting for
  sentAt: number
  cache?: string // asked first; a hit skips the steps
  steps: string[] // the other dependencies for this request's route, called one after another in link order
  step: number // index of the next step to call
}

interface ServerState {
  jobs: Job[]
  queue: Packet[]
}

const CACHE_TYPES = new Set(['cache', 'cdn'])

/** The dependencies a request calls: the links that carry its route. */
function downstream(node: LabNode, packet: Packet, ctx: NodeContext) {
  const targets = ctx.targetsFor(node.id, packet.route)
  return {
    cache: targets.find((t) => CACHE_TYPES.has(ctx.nodeType(t) ?? '')),
    steps: targets.filter((t) => !CACHE_TYPES.has(ctx.nodeType(t) ?? '')),
  }
}

/** A reply can still arrive after we gave up on it, so a request that moves on travels as its own copy. */
const copy = (p: Packet): Packet => ({ ...p, path: [...p.path] })

function startProcessing(node: LabNode, job: Job, ctx: NodeContext) {
  const cfg = node.config as ServerConfig
  const warm = cfg.warmupMs > 0 && ctx.now - ctx.startedAt(node.id) < cfg.warmupMs
  const jitter = cfg.jitterMs > 0 ? ctx.random() * cfg.jitterMs : 0
  job.stage = 'processing'
  job.waitingOn = undefined
  job.finishAt = ctx.now + cfg.processingMs * (warm ? 2 : 1) + jitter
}

function callDependency(node: LabNode, job: Job, to: string, ctx: NodeContext, packet = job.packet) {
  job.stage = 'downstream'
  job.packet = packet
  job.waitingOn = to
  job.sentAt = ctx.now
  ctx.send(node.id, to, packet)
}

/** Call the next step, or start processing once every step has answered. */
function advance(node: LabNode, job: Job, ctx: NodeContext, packet = job.packet) {
  packet.phase = 'request'
  packet.status = 'ok'
  packet.error = undefined
  const to = job.steps[job.step]
  if (to === undefined) startProcessing(node, job, ctx)
  else callDependency(node, job, to, ctx, packet)
}

function admit(node: LabNode, packet: Packet, st: ServerState, ctx: NodeContext) {
  const { cache, steps } = downstream(node, packet, ctx)
  const job: Job = { packet, stage: 'processing', finishAt: 0, sentAt: 0, cache, steps, step: 0 }
  st.jobs.push(job)
  if (cache) callDependency(node, job, cache, ctx)
  else advance(node, job, ctx)
}

function refresh(node: LabNode, st: ServerState, ctx: NodeContext) {
  const cfg = node.config as ServerConfig
  const s = ctx.stats(node.id)
  s.active = st.jobs.length
  s.queued = st.queue.length
  s.loadPct = Math.round((st.jobs.length / Math.max(1, cfg.capacity)) * 100)
}

export const serverHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as ServerConfig
    const st = ctx.state<ServerState>(node.id, () => ({ jobs: [], queue: [] }))
    const s = ctx.stats(node.id)

    if (cfg.down) {
      s.dropped += 1 // connection refused: nobody answers
      return
    }

    if (packet.phase === 'response') {
      // Only the reply we're still waiting for counts; anything else arrived after a timeout.
      const job = st.jobs.find((j) => j.packet === packet && j.stage === 'downstream' && j.waitingOn === packet.from)
      if (!job) return
      const fromCache = packet.from === job.cache
      if (fromCache && packet.status === 'error' && packet.error === 'miss') {
        advance(node, job, ctx)
        return
      }
      if (packet.status === 'error') {
        st.jobs = st.jobs.filter((j) => j !== job)
        s.failed += 1
        ctx.respond(node.id, packet)
        refresh(node, st, ctx)
        return
      }
      if (fromCache) {
        startProcessing(node, job, ctx) // hit: no need to call the steps
        return
      }
      if (job.step === 0 && job.cache && ctx.routeKind(packet.route) !== 'write') {
        // cache-aside: we fetched from the origin, so write it into the cache for next time
        cachePut(ctx.state<CacheState>(job.cache, initCache), ctx.nodeConfig(job.cache) as CacheConfig, cacheKey(packet), ctx.now)
      }
      job.step += 1
      advance(node, job, ctx)
      return
    }

    enter(node, packet)
    if (st.jobs.length < cfg.capacity) admit(node, packet, st, ctx)
    else if (st.queue.length < cfg.queueSize) st.queue.push(packet)
    else {
      s.dropped += 1
      ctx.respond(node.id, packet, 'error', 'dropped')
    }
    refresh(node, st, ctx)
  },
  tick(node, _dt, ctx) {
    const cfg = node.config as ServerConfig
    const st = ctx.state<ServerState>(node.id, () => ({ jobs: [], queue: [] }))
    const s = ctx.stats(node.id)

    // A dependency that never answers (down, cut link, overloaded) must not hold a slot forever.
    for (const job of st.jobs.filter((j) => j.stage === 'downstream')) {
      const onCache = job.waitingOn !== undefined && job.waitingOn === job.cache
      if (ctx.now - job.sentAt <= (onCache ? cfg.cacheTimeoutMs : cfg.backendTimeoutMs)) continue
      if (onCache) {
        advance(node, job, ctx, copy(job.packet)) // no answer from the cache counts as a miss
      } else {
        st.jobs = st.jobs.filter((j) => j !== job)
        s.failed += 1
        s.timeouts += 1
        ctx.respond(node.id, copy(job.packet), 'error', 'timeout')
      }
    }

    const done = st.jobs.filter((j) => j.stage === 'processing' && j.finishAt <= ctx.now)
    if (done.length > 0) {
      st.jobs = st.jobs.filter((j) => !done.includes(j))
      for (const job of done) {
        if (cfg.failureRate > 0 && ctx.random() < cfg.failureRate) {
          s.failed += 1
          ctx.respond(node.id, job.packet, 'error', 'failed')
        } else {
          s.processed += 1
          ctx.respond(node.id, job.packet, 'ok')
        }
      }
    }
    while (st.queue.length > 0 && st.jobs.length < cfg.capacity) admit(node, st.queue.shift()!, st, ctx)
    refresh(node, st, ctx)
  },
}
