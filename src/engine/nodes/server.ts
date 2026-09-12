import type { NodeHandler, Packet, ServerConfig } from '../types'

interface Job {
  packet: Packet
  finishAt: number
}

interface ServerState {
  jobs: Job[]
}

export const serverHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as ServerConfig
    const st = ctx.state<ServerState>(node.id, () => ({ jobs: [] }))
    const stats = (ctx.stats.servers[node.id] ??= {
      active: 0,
      processed: 0,
      dropped: 0,
      loadPct: 0,
    })

    if (st.jobs.length >= cfg.capacity) {
      stats.dropped += 1
      return
    }
    packet.path.push(node.id)
    st.jobs.push({ packet, finishAt: ctx.now + cfg.processingMs })
    stats.active = st.jobs.length
    stats.loadPct = Math.round((stats.active / cfg.capacity) * 100)
  },
  tick(node, _dt, ctx) {
    const cfg = node.config as ServerConfig
    const st = ctx.state<ServerState>(node.id, () => ({ jobs: [] }))
    const stats = (ctx.stats.servers[node.id] ??= {
      active: 0,
      processed: 0,
      dropped: 0,
      loadPct: 0,
    })

    const done = st.jobs.filter((j) => j.finishAt <= ctx.now)
    if (done.length === 0) {
      stats.active = st.jobs.length
      stats.loadPct = Math.round((stats.active / cfg.capacity) * 100)
      return
    }
    st.jobs = st.jobs.filter((j) => j.finishAt > ctx.now)
    for (const job of done) {
      stats.processed += 1
      const p = job.packet
      p.phase = 'response'
      const idx = p.path.lastIndexOf(node.id)
      const back = p.path[idx - 1]
      if (back) ctx.send(node.id, back, p)
    }
    stats.active = st.jobs.length
    stats.loadPct = Math.round((stats.active / cfg.capacity) * 100)
  },
}
