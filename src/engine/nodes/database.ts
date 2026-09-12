import type { DatabaseConfig, NodeHandler, Packet } from '../types'
import { enter } from './util'

interface Query {
  packet: Packet
  read: boolean
  finishAt: number
}

interface DbState {
  active: Query[]
  queue: { packet: Packet; read: boolean }[]
}

function capacityFor(cfg: DatabaseConfig, read: boolean) {
  return read ? cfg.capacity * (1 + cfg.replicas) : cfg.capacity
}

export const databaseHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as DatabaseConfig
    const st = ctx.state<DbState>(node.id, () => ({ active: [], queue: [] }))
    const s = ctx.stats(node.id)
    if (cfg.down) {
      s.dropped += 1
      return
    }
    if (packet.phase === 'response') return // databases are leaves
    enter(node, packet)
    const read = ctx.random() < cfg.readRatio
    const running = st.active.filter((q) => q.read === read).length
    if (running < capacityFor(cfg, read)) st.active.push({ packet, read, finishAt: ctx.now + cfg.latencyMs })
    else st.queue.push({ packet, read })
  },
  tick(node, _dt, ctx) {
    const cfg = node.config as DatabaseConfig
    const st = ctx.state<DbState>(node.id, () => ({ active: [], queue: [] }))
    const s = ctx.stats(node.id)

    const done = st.active.filter((q) => q.finishAt <= ctx.now)
    if (done.length > 0) {
      st.active = st.active.filter((q) => !done.includes(q))
      for (const q of done) {
        s.processed += 1
        ctx.respond(node.id, q.packet, 'ok')
      }
    }
    // Admit queued queries while there is capacity for their kind.
    const rest: DbState['queue'] = []
    for (const q of st.queue) {
      const running = st.active.filter((a) => a.read === q.read).length
      if (running < capacityFor(cfg, q.read)) st.active.push({ ...q, finishAt: ctx.now + cfg.latencyMs })
      else rest.push(q)
    }
    st.queue = rest
    s.active = st.active.length
    s.queued = st.queue.length
    s.loadPct = Math.round((st.active.length / Math.max(1, cfg.capacity * (1 + cfg.replicas))) * 100)
  },
}
