import type { ApiGatewayConfig, NodeHandler } from '../types'
import { enter, flushDelayed, type Delayed } from './util'

interface GwState {
  delayed: Delayed[]
}

export const apiGatewayHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as ApiGatewayConfig
    const st = ctx.state<GwState>(node.id, () => ({ delayed: [] }))
    if (packet.phase === 'response') {
      ctx.respond(node.id, packet)
      return
    }
    enter(node, packet)
    if (cfg.authFailRate > 0 && ctx.random() < cfg.authFailRate) {
      ctx.stats(node.id).rejected += 1
      ctx.respond(node.id, packet, 'error', 'unauthorized')
      return
    }
    st.delayed.push({ packet, at: ctx.now + cfg.latencyMs, action: 'forward' })
  },
  tick(node, _dt, ctx) {
    const st = ctx.state<GwState>(node.id, () => ({ delayed: [] }))
    st.delayed = flushDelayed(node, st.delayed, ctx)
  },
}
