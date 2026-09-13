import type { NodeHandler, Packet, WorldConfig } from '../types'
import { forward } from './util'

interface WorldState {
  acc: number
  sinceBurst: number
  pending: Map<string, number> // packet id → sent at
}

/** Pick a route id by weight; undefined without a mix. */
function pickRoute(mix: WorldConfig['mix'], random: () => number): string | undefined {
  const weights = Object.entries(mix ?? {}).filter(([, w]) => w > 0)
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  if (total === 0) return undefined
  let r = random() * total
  for (const [id, w] of weights) {
    if (r < w) return id
    r -= w
  }
  return weights[weights.length - 1][0]
}

export const worldHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const st = ctx.state<WorldState>(node.id, () => ({ acc: 0, sinceBurst: 0, pending: new Map() }))
    if (!st.pending.has(packet.id)) return // late reply after timeout
    st.pending.delete(packet.id)
    const s = ctx.stats(node.id)
    if (packet.status === 'ok') {
      s.processed += 1
      ctx.complete(packet, 'ok')
    } else {
      s.failed += 1
      ctx.complete(packet, packet.error ?? 'error')
    }
  },
  tick(node, dt, ctx) {
    const cfg = node.config as WorldConfig
    const st = ctx.state<WorldState>(node.id, () => ({ acc: 0, sinceBurst: 0, pending: new Map() }))

    const emit = () => {
      const packet: Packet = {
        id: ctx.nextId(),
        clientId: `c${1 + Math.floor(ctx.random() * Math.max(1, cfg.clients))}`,
        key: Math.floor(ctx.random() * Math.max(1, cfg.keyspace)),
        route: pickRoute(cfg.mix, ctx.random),
        edgeId: '',
        from: node.id,
        to: '',
        progress: 0,
        phase: 'request',
        status: 'ok',
        createdAt: ctx.now,
        path: [node.id],
      }
      ctx.global.sent += 1
      if (ctx.targetsFor(node.id, packet.route).length === 0) {
        ctx.stats(node.id).failed += 1
        ctx.complete(packet, 'no-route')
        return
      }
      st.pending.set(packet.id, ctx.now)
      ctx.stats(node.id).active = st.pending.size
      forward(node, packet, ctx)
    }

    if (cfg.pattern === 'burst') {
      st.sinceBurst += dt
      if (st.sinceBurst >= cfg.burstEvery) {
        st.sinceBurst -= cfg.burstEvery
        for (let i = 0; i < cfg.burstSize; i++) emit()
      }
    } else {
      // acc counts packet·ms so 50ms ticks at integer rps stay exact.
      st.acc += dt * cfg.rps
      while (st.acc >= 1000) {
        st.acc -= 1000
        emit()
      }
    }

    // Give up on replies that never came.
    for (const [id, sentAt] of st.pending) {
      if (ctx.now - sentAt > cfg.timeoutMs) {
        st.pending.delete(id)
        ctx.stats(node.id).timeouts += 1
        ctx.complete({ id } as Packet, 'timeout')
      }
    }
    ctx.stats(node.id).active = st.pending.size
  },
}
