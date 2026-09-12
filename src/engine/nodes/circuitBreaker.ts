import type { CircuitBreakerConfig, NodeHandler } from '../types'
import { enter, forward } from './util'

interface CbState {
  failures: number[]
  mode: 'closed' | 'open' | 'half-open'
  openedAt: number
  probing: boolean
}

export const circuitBreakerHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as CircuitBreakerConfig
    const st = ctx.state<CbState>(node.id, () => ({ failures: [], mode: 'closed', openedAt: 0, probing: false }))
    const s = ctx.stats(node.id)

    if (packet.phase === 'response') {
      st.probing = false
      if (packet.status === 'error') {
        st.failures = st.failures.filter((t) => ctx.now - t < cfg.windowMs)
        st.failures.push(ctx.now)
        if (st.mode === 'half-open' || st.failures.length >= cfg.failureThreshold) {
          st.mode = 'open'
          st.openedAt = ctx.now
        }
      } else if (st.mode === 'half-open') {
        st.mode = 'closed'
        st.failures = []
      }
      s.state = st.mode
      ctx.respond(node.id, packet)
      return
    }

    enter(node, packet)
    if (st.mode === 'open' && ctx.now - st.openedAt >= cfg.openMs) st.mode = 'half-open'
    if (st.mode === 'open' || (st.mode === 'half-open' && st.probing)) {
      s.rejected += 1
      s.state = st.mode
      ctx.respond(node.id, packet, 'error', 'circuit-open')
      return
    }
    if (st.mode === 'half-open') st.probing = true
    s.state = st.mode
    forward(node, packet, ctx)
  },
  tick(node, _dt, ctx) {
    const cfg = node.config as CircuitBreakerConfig
    const st = ctx.state<CbState>(node.id, () => ({ failures: [], mode: 'closed', openedAt: 0, probing: false }))
    if (st.mode === 'open' && ctx.now - st.openedAt >= cfg.openMs) st.mode = 'half-open'
    ctx.stats(node.id).state = st.mode
  },
}
