import type { LbConfig, NodeHandler, Packet, NodeContext, LabNode } from '../types'
import { enter, hash } from './util'

interface Pending {
  packet: Packet
  target: string
  sentAt: number
  tries: number
}

interface LbState {
  rr: number
  wrr: number
  pending: Map<string, Pending>
}

const RETRIABLE = new Set(['failed', 'timeout'])

function pick(node: LabNode, packet: Packet, ctx: NodeContext, st: LbState, exclude?: string): string | undefined {
  const cfg = node.config as LbConfig
  let targets = ctx.targets(node.id).sort()
  if (cfg.healthCheck) targets = targets.filter((t) => !ctx.isDown(t))
  if (exclude && targets.length > 1) targets = targets.filter((t) => t !== exclude)
  if (targets.length === 0) return undefined

  switch (cfg.algorithm) {
    case 'random':
      return targets[Math.floor(ctx.random() * targets.length)]
    case 'leastConnections': {
      // Count requests this LB has open per target: pass-through nodes (breaker, queue) report no load of their own.
      const open = new Map<string, number>()
      for (const p of st.pending.values()) open.set(p.target, (open.get(p.target) ?? 0) + 1)
      let best = targets[0]
      let bestLoad = Infinity
      for (const t of targets) {
        const load = open.get(t) ?? 0
        if (load < bestLoad) {
          bestLoad = load
          best = t
        }
      }
      return best
    }
    case 'weightedRoundRobin': {
      const weights = targets.map((t) => Math.max(0, cfg.weights[t] ?? 1))
      const total = weights.reduce((a, b) => a + b, 0)
      if (total === 0) return targets[st.rr++ % targets.length]
      let slot = st.wrr % total
      st.wrr += 1
      for (let i = 0; i < targets.length; i++) {
        if (slot < weights[i]) return targets[i]
        slot -= weights[i]
      }
      return targets[0]
    }
    case 'ipHash':
      return targets[hash(packet.clientId) % targets.length]
    case 'roundRobin':
    default:
      return targets[st.rr++ % targets.length]
  }
}

function dispatch(node: LabNode, packet: Packet, ctx: NodeContext, st: LbState, tries: number, exclude?: string) {
  const target = pick(node, packet, ctx, st, exclude)
  const s = ctx.stats(node.id)
  if (!target) {
    st.pending.delete(packet.id)
    s.rejected += 1
    ctx.respond(node.id, packet, 'error', 'no-healthy-server')
    return
  }
  packet.phase = 'request'
  packet.status = 'ok'
  packet.error = undefined
  st.pending.set(packet.id, { packet, target, sentAt: ctx.now, tries })
  s.out += 1
  s.perTarget[target] = (s.perTarget[target] ?? 0) + 1
  s.active = st.pending.size
  ctx.send(node.id, target, packet)
}

export const lbHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as LbConfig
    const st = ctx.state<LbState>(node.id, () => ({ rr: 0, wrr: 0, pending: new Map() }))

    if (packet.phase === 'request') {
      enter(node, packet)
      dispatch(node, packet, ctx, st, 1)
      return
    }

    const p = st.pending.get(packet.id)
    if (!p) return // reply for a request we already gave up on
    if (packet.status === 'error' && RETRIABLE.has(packet.error ?? '') && p.tries <= cfg.retries) {
      ctx.stats(node.id).retries += 1
      dispatch(node, packet, ctx, st, p.tries + 1, p.target)
      return
    }
    st.pending.delete(packet.id)
    ctx.stats(node.id).active = st.pending.size
    if (packet.status === 'error') ctx.stats(node.id).failed += 1
    else ctx.stats(node.id).processed += 1
    ctx.respond(node.id, packet)
  },
  tick(node, _dt, ctx) {
    const cfg = node.config as LbConfig
    const st = ctx.state<LbState>(node.id, () => ({ rr: 0, wrr: 0, pending: new Map() }))
    for (const p of [...st.pending.values()]) {
      if (ctx.now - p.sentAt <= cfg.timeoutMs) continue
      ctx.stats(node.id).timeouts += 1
      if (p.tries <= cfg.retries) {
        ctx.stats(node.id).retries += 1
        dispatch(node, p.packet, ctx, st, p.tries + 1, p.target)
      } else {
        st.pending.delete(p.packet.id)
        ctx.stats(node.id).failed += 1
        ctx.respond(node.id, p.packet, 'error', 'timeout')
      }
    }
    ctx.stats(node.id).active = st.pending.size
  },
}
