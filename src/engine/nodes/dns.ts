import type { DnsConfig, NodeHandler } from '../types'
import { enter, forward, flushDelayed, type Delayed } from './util'

interface DnsState {
  cache: Map<string, number> // client id → expires at
  delayed: Delayed[]
}

export const dnsHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as DnsConfig
    const st = ctx.state<DnsState>(node.id, () => ({ cache: new Map(), delayed: [] }))
    const s = ctx.stats(node.id)
    if (packet.phase === 'response') {
      ctx.respond(node.id, packet)
      return
    }
    enter(node, packet)
    const exp = st.cache.get(packet.clientId)
    if (exp !== undefined && exp > ctx.now) {
      s.hits += 1
      forward(node, packet, ctx)
      return
    }
    s.misses += 1
    st.cache.set(packet.clientId, ctx.now + cfg.latencyMs + cfg.ttlMs)
    st.delayed.push({ packet, at: ctx.now + cfg.latencyMs, action: 'forward' })
  },
  tick(node, _dt, ctx) {
    const st = ctx.state<DnsState>(node.id, () => ({ cache: new Map(), delayed: [] }))
    st.delayed = flushDelayed(node, st.delayed, ctx)
  },
}
