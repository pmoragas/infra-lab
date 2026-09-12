import type { NodeHandler, Packet, QueueConfig } from '../types'
import { enter } from './util'

export interface QueueState {
  items: Packet[]
}

export const initQueue = (): QueueState => ({ items: [] })

/** Producers get an immediate 'accepted' reply; a job copy waits for a Consumer. */
export const queueHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as QueueConfig
    const st = ctx.state<QueueState>(node.id, initQueue)
    const s = ctx.stats(node.id)
    if (packet.phase === 'response') return

    // Dead letters arrive from a consumer: just keep them.
    if (ctx.nodeType(packet.from) === 'consumer') {
      st.items.push(packet)
      s.queued = st.items.length
      return
    }

    enter(node, packet)
    if (st.items.length >= cfg.maxSize) {
      s.dropped += 1
      ctx.respond(node.id, packet, 'error', 'queue-full')
      return
    }
    const job: Packet = { ...packet, id: `${packet.id}.job`, path: [node.id], phase: 'request', status: 'ok', error: undefined }
    st.items.push(job)
    s.queued = st.items.length
    s.processed += 1
    ctx.respond(node.id, packet, 'ok')
  },
  tick(node, _dt, ctx) {
    const cfg = node.config as QueueConfig
    const st = ctx.state<QueueState>(node.id, initQueue)
    const s = ctx.stats(node.id)
    s.queued = st.items.length
    s.loadPct = Math.round((st.items.length / Math.max(1, cfg.maxSize)) * 100)
  },
}
