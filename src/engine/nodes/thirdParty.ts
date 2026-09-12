import type { NodeHandler, Packet, ThirdPartyConfig } from '../types'
import { enter } from './util'

interface TpState {
  pending: { packet: Packet; finishAt: number }[]
}

export const thirdPartyHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as ThirdPartyConfig
    const st = ctx.state<TpState>(node.id, () => ({ pending: [] }))
    const s = ctx.stats(node.id)
    if (cfg.down) {
      s.dropped += 1
      return
    }
    if (packet.phase === 'response') return
    enter(node, packet)
    const jitter = cfg.jitterMs > 0 ? ctx.random() * cfg.jitterMs : 0
    st.pending.push({ packet, finishAt: ctx.now + cfg.latencyMs + jitter })
  },
  tick(node, _dt, ctx) {
    const cfg = node.config as ThirdPartyConfig
    const st = ctx.state<TpState>(node.id, () => ({ pending: [] }))
    const s = ctx.stats(node.id)
    const due = st.pending.filter((p) => p.finishAt <= ctx.now)
    if (due.length > 0) {
      st.pending = st.pending.filter((p) => p.finishAt > ctx.now)
      for (const p of due) {
        if (cfg.failureRate > 0 && ctx.random() < cfg.failureRate) {
          s.failed += 1
          ctx.respond(node.id, p.packet, 'error', 'failed')
        } else {
          s.processed += 1
          ctx.respond(node.id, p.packet, 'ok')
        }
      }
    }
    s.active = st.pending.length
  },
}
