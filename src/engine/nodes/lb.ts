import type { LbConfig, NodeHandler } from '../types'

interface LbState {
  rrIndex: number
}

export const lbHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    if (packet.phase === 'response') {
      // Walk the request path backwards.
      const idx = packet.path.lastIndexOf(node.id)
      const back = packet.path[idx - 1]
      if (back) ctx.send(node.id, back, packet)
      return
    }

    const targets = ctx.targets(node.id)
    if (targets.length === 0) return

    const cfg = node.config as LbConfig
    const st = ctx.state<LbState>(node.id, () => ({ rrIndex: 0 }))
    let chosen: string

    switch (cfg.algorithm) {
      case 'random':
        chosen = targets[Math.floor(ctx.random() * targets.length)]
        break
      case 'leastConnections': {
        chosen = targets[0]
        let best = Infinity
        for (const t of targets) {
          const active = ctx.stats.servers[t]?.active ?? 0
          if (active < best) {
            best = active
            chosen = t
          }
        }
        break
      }
      case 'roundRobin':
      default:
        chosen = targets[st.rrIndex % targets.length]
        st.rrIndex = (st.rrIndex + 1) % targets.length
    }

    const stats = (ctx.stats.lbs[node.id] ??= { routed: 0, perServer: {} })
    stats.routed += 1
    stats.perServer[chosen] = (stats.perServer[chosen] ?? 0) + 1

    packet.path.push(node.id)
    ctx.send(node.id, chosen, packet)
  },
  tick() {},
}
