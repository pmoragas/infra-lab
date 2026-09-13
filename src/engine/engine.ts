import { createRng } from './rng'
import { handlers } from './nodes'
import { DEFAULT_EDGE, DEFAULT_SETTINGS, withDefaults } from './defaults'
import type {
  ChaosState,
  Failure,
  Journey,
  LabEdge,
  LabNode,
  NodeConfig,
  NodeContext,
  NodeStats,
  NodeType,
  Packet,
  PacketStatus,
  Project,
  SimState,
  Stats,
  WorldConfig,
} from './types'

export interface EngineOptions {
  /** Sim time advanced per tick, ms. */
  tickMs?: number
  /** Timer used by start(); defaults to setInterval. Tests can omit start() and call step(). */
  setInterval?: typeof globalThis.setInterval
  clearInterval?: typeof globalThis.clearInterval
}

export type Listener = (state: SimState) => void

export interface Engine {
  start(): void
  pause(): void
  reset(): void
  step(dt?: number): void
  subscribe(listener: Listener): () => void
  getState(): SimState
  addNode(node: LabNode): void
  removeNode(id: string): void
  addEdge(edge: LabEdge): void
  removeEdge(id: string): void
  updateNodeConfig(id: string, patch: Partial<NodeConfig>): void
  updateEdgeConfig(id: string, patch: Partial<LabEdge['config']>): void
  setSpeed(speed: number): void
  setFailures(failures: Failure[]): void
  /** A packet's journey so far, whether still in flight or recently completed. */
  getJourney(id: string): Journey | undefined
}

const JOURNEY_LIMIT = 200
const JOURNEY_STALE_MS = 60_000

export function emptyNodeStats(): NodeStats {
  return {
    in: 0,
    out: 0,
    active: 0,
    queued: 0,
    processed: 0,
    dropped: 0,
    failed: 0,
    rejected: 0,
    hits: 0,
    misses: 0,
    retries: 0,
    timeouts: 0,
    loadPct: 0,
    perTarget: {},
  }
}

function emptyStats(): Stats {
  return { nodes: {}, global: { sent: 0, ok: 0, error: 0, timeout: 0, errors: {} } }
}

export function createEngine(project: Project, opts: EngineOptions = {}): Engine {
  const tickMs = opts.tickMs ?? 50
  const setI = opts.setInterval ?? globalThis.setInterval
  const clearI = opts.clearInterval ?? globalThis.clearInterval
  const settings = { ...DEFAULT_SETTINGS, ...project.settings }

  const nodes = new Map<string, LabNode>()
  const edges = new Map<string, LabEdge>()
  for (const n of project.nodes) nodes.set(n.id, { ...n, config: withDefaults(n.type, n.config as never) })
  for (const e of project.edges) edges.set(e.id, { ...e, config: { ...DEFAULT_EDGE, ...e.config } })

  let status: SimState['status'] = 'idle'
  let tick = 0
  let now = 0
  let packets: Packet[] = []
  let stats: Stats = emptyStats()
  let nodeState = new Map<string, unknown>()
  let startedAt = new Map<string, number>()
  let rng = createRng(settings.seed)
  let idCounter = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const listeners = new Set<Listener>()

  let failures: Failure[] = [...(project.failures ?? [])]
  let scheduledDown = new Set<string>()
  let scheduledCut = new Set<string>()
  let spikes = new Map<string, number>()
  let journeys = new Map<string, Journey>() // in progress
  let completed: Journey[] = []

  function findEdge(a: string, b: string): LabEdge | undefined {
    for (const e of edges.values()) {
      if ((e.source === a && e.target === b) || (e.source === b && e.target === a)) return e
    }
    return undefined
  }

  function nodeDown(id: string) {
    return (nodes.get(id)?.config as { down?: boolean } | undefined)?.down === true || scheduledDown.has(id)
  }

  function edgeCut(e: LabEdge) {
    return e.config?.down === true || scheduledCut.has(e.id)
  }

  /** Journeys start when a packet leaves its origin; later hops attach by packet id. */
  function journeyFor(packet: Packet, from: string): Journey | undefined {
    let j = journeys.get(packet.id)
    if (!j && packet.phase === 'request' && packet.path.length <= 1) {
      j = { id: packet.id, clientId: packet.clientId, key: packet.key, startedAt: packet.createdAt, hops: [{ node: from, at: now, phase: 'request' }] }
      journeys.set(packet.id, j)
    }
    return j
  }

  /** Scheduled failures active at `to`; flushes fire once when their time falls in [from, to). */
  function applyFailures(from: number, to: number) {
    const down = new Set<string>()
    const cut = new Set<string>()
    const sp = new Map<string, number>()
    for (const f of failures) {
      if (f.kind === 'flush') {
        if (f.atMs >= from && f.atMs < to) (nodeState.get(f.target) as { entries?: Map<number, number> } | undefined)?.entries?.clear()
        continue
      }
      if (to < f.atMs || to >= f.atMs + f.durationMs) continue
      if (f.kind === 'kill') down.add(f.target)
      else if (f.kind === 'partition') cut.add(f.target)
      else sp.set(f.target, (sp.get(f.target) ?? 1) * f.factor)
    }
    for (const id of scheduledDown) if (!down.has(id)) startedAt.set(id, to) // back up: warm-up starts again
    scheduledDown = down
    scheduledCut = cut
    spikes = sp
  }

  function effective(node: LabNode): LabNode {
    const factor = spikes.get(node.id)
    if (!factor || node.type !== 'world') return node
    const c = node.config as WorldConfig
    return { ...node, config: { ...c, rps: c.rps * factor, burstSize: Math.ceil(c.burstSize * factor) } }
  }

  const ctx: NodeContext = {
    get now() {
      return now
    },
    random: () => rng(),
    nextId: () => `p${++idCounter}`,
    send(from, to, packet) {
      const edge = findEdge(from, to)
      if (!edge) return
      const journey = journeyFor(packet, from)
      const loss = edge.config?.lossPct ?? 0
      if (edgeCut(edge) || (loss > 0 && rng() * 100 < loss)) {
        journey?.hops.push({ node: to, at: now, phase: packet.phase, lost: true })
        return
      }
      // A request re-sent from a node it already visited (retry, cache miss → origin) restarts its path there,
      // so the reply walks back through real edges only.
      if (packet.phase === 'request') {
        const i = packet.path.lastIndexOf(from)
        if (i >= 0) packet.path.length = i + 1
      }
      packet.edgeId = edge.id
      packet.from = from
      packet.to = to
      packet.progress = 0
      packets.push(packet)
    },
    respond(nodeId, packet, statusIn, error) {
      packet.phase = 'response'
      if (statusIn) packet.status = statusIn
      if (error) packet.error = error
      const idx = packet.path.lastIndexOf(nodeId)
      const back = packet.path[idx - 1]
      if (back) ctx.send(nodeId, back, packet)
    },
    targets(nodeId) {
      const out: string[] = []
      for (const e of edges.values()) if (e.source === nodeId) out.push(e.target)
      return out
    },
    sources(nodeId) {
      const out: string[] = []
      for (const e of edges.values()) if (e.target === nodeId) out.push(e.source)
      return out
    },
    nodeType: (id) => nodes.get(id)?.type,
    nodeConfig: (id) => nodes.get(id)?.config,
    isDown: nodeDown,
    state<T>(nodeId: string, init: () => T): T {
      if (!nodeState.has(nodeId)) nodeState.set(nodeId, init())
      return nodeState.get(nodeId) as T
    },
    stats(nodeId) {
      return (stats.nodes[nodeId] ??= emptyNodeStats())
    },
    get global() {
      return stats.global
    },
    complete(packet, outcome) {
      const g = stats.global
      if (outcome === 'ok') g.ok += 1
      else if (outcome === 'timeout') g.timeout += 1
      else {
        g.error += 1
        g.errors[outcome] = (g.errors[outcome] ?? 0) + 1
      }
      const j = journeys.get(packet.id)
      if (!j) return
      j.endedAt = now
      j.outcome = outcome
      journeys.delete(packet.id)
      completed.push(j)
      if (completed.length > JOURNEY_LIMIT) completed = completed.slice(-JOURNEY_LIMIT)
    },
    startedAt: (id) => startedAt.get(id) ?? 0,
  }

  function chaosState(): ChaosState {
    const down: string[] = []
    for (const id of nodes.keys()) if (nodeDown(id)) down.push(id)
    const cut: string[] = []
    for (const e of edges.values()) if (edgeCut(e)) cut.push(e.id)
    return { down, cut, spikes: Object.fromEntries(spikes) }
  }

  function snapshot(): SimState {
    return {
      status,
      tick,
      now,
      packets: packets.map((p) => ({ ...p, path: [...p.path] })),
      stats: structuredClone(stats),
      journeys: completed.slice(), // completed journeys are never mutated again
      chaos: chaosState(),
    }
  }

  function emit() {
    const s = snapshot()
    for (const l of listeners) l(s)
  }

  function step(dt = tickMs * settings.speed) {
    tick += 1
    const from = now
    now += dt
    applyFailures(from, now)

    // 1. Move packets; deliver the ones that arrived.
    const arrived: Packet[] = []
    const inFlight: Packet[] = []
    for (const p of packets) {
      const travel = edges.get(p.edgeId)?.config?.latencyMs ?? DEFAULT_EDGE.latencyMs
      p.progress = Math.min(1, p.progress + dt / Math.max(1, travel))
      if (p.progress >= 1) arrived.push(p)
      else inFlight.push(p)
    }
    packets = inFlight
    for (const p of arrived) {
      const node = nodes.get(p.to)
      if (!node) continue
      journeys.get(p.id)?.hops.push({ node: node.id, at: now, phase: p.phase })
      const s = ctx.stats(node.id)
      s.in += 1
      if (nodeDown(node.id)) {
        s.dropped += 1 // nobody answers
        continue
      }
      handlers[node.type].onPacket(node, p, ctx)
    }

    // 2. Tick every node that is up.
    for (const node of nodes.values()) if (!nodeDown(node.id)) handlers[node.type].tick(effective(node), dt, ctx)

    // Journeys that never complete (lost jobs, dropped packets nobody waits for) must not pile up.
    if (tick % 20 === 0) for (const [id, j] of journeys) if (now - j.startedAt > JOURNEY_STALE_MS) journeys.delete(id)

    emit()
  }

  function start() {
    if (status === 'running') return
    status = 'running'
    for (const id of nodes.keys()) if (!startedAt.has(id)) startedAt.set(id, now)
    timer = setI(() => step(), tickMs)
    emit()
  }

  function pause() {
    if (status !== 'running') return
    status = 'paused'
    if (timer !== undefined) clearI(timer)
    timer = undefined
    emit()
  }

  function reset() {
    if (timer !== undefined) clearI(timer)
    timer = undefined
    status = 'idle'
    tick = 0
    now = 0
    packets = []
    stats = emptyStats()
    nodeState = new Map()
    startedAt = new Map()
    rng = createRng(settings.seed)
    idCounter = 0
    scheduledDown = new Set()
    scheduledCut = new Set()
    spikes = new Map()
    journeys = new Map()
    completed = []
    emit()
  }

  return {
    start,
    pause,
    reset,
    step,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getState: snapshot,
    addNode(node) {
      nodes.set(node.id, { ...node, config: withDefaults(node.type, node.config as never) })
      startedAt.set(node.id, now)
    },
    removeNode(id) {
      nodes.delete(id)
      nodeState.delete(id)
      startedAt.delete(id)
      for (const [eid, e] of edges) if (e.source === id || e.target === id) edges.delete(eid)
      packets = packets.filter((p) => p.from !== id && p.to !== id)
      delete stats.nodes[id]
    },
    addEdge(edge) {
      edges.set(edge.id, { ...edge, config: { ...DEFAULT_EDGE, ...edge.config } })
    },
    removeEdge(id) {
      edges.delete(id)
      packets = packets.filter((p) => p.edgeId !== id)
    },
    updateNodeConfig(id, patch) {
      const n = nodes.get(id)
      if (!n) return
      const wasDown = (n.config as { down?: boolean }).down === true
      n.config = { ...n.config, ...patch } as NodeConfig
      if (wasDown && (patch as { down?: boolean }).down === false) startedAt.set(id, now) // revived: warm-up again
    },
    updateEdgeConfig(id, patch) {
      const e = edges.get(id)
      if (e) e.config = { ...DEFAULT_EDGE, ...e.config, ...patch }
    },
    setSpeed(speed) {
      settings.speed = speed
    },
    setFailures(list) {
      failures = [...list]
    },
    getJourney(id) {
      const j = journeys.get(id) ?? completed.find((c) => c.id === id)
      return j && structuredClone(j)
    },
  }
}

export type { NodeType, PacketStatus }
