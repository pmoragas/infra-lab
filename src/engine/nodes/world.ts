import type { Intensity, NodeHandler, Packet, WorldConfig } from '../types'

export const EMIT_INTERVAL_MS: Record<Intensity, number> = {
  slow: 1000,
  normal: 500,
  fast: 200,
  burst: 50,
}

interface WorldState {
  sinceLastEmit: number
}

export const worldHandler: NodeHandler = {
  onPacket() {
    // Responses arriving back at the World are simply absorbed.
  },
  tick(node, dt, ctx) {
    const cfg = node.config as WorldConfig
    const st = ctx.state<WorldState>(node.id, () => ({ sinceLastEmit: 0 }))
    const interval = EMIT_INTERVAL_MS[cfg.intensity]
    st.sinceLastEmit += dt
    while (st.sinceLastEmit >= interval) {
      st.sinceLastEmit -= interval
      for (const target of ctx.targets(node.id)) {
        const packet: Packet = {
          id: ctx.nextId(),
          edgeId: '',
          from: node.id,
          to: target,
          progress: 0,
          phase: 'request',
          createdAt: ctx.now,
          path: [node.id],
        }
        ctx.send(node.id, target, packet)
      }
    }
  },
}
