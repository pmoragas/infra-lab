import type { ConsumerConfig, NodeHandler, Packet } from '../types'
import { initQueue, type QueueState } from './queue'

interface Job {
  packet: Packet
  finishAt: number
  attempts: number
}

interface ConsumerState {
  jobs: Job[]
}

export const consumerHandler: NodeHandler = {
  onPacket() {
    // Consumers pull; nothing is pushed to them.
  },
  tick(node, _dt, ctx) {
    const cfg = node.config as ConsumerConfig
    const st = ctx.state<ConsumerState>(node.id, () => ({ jobs: [] }))
    const s = ctx.stats(node.id)

    // Finish jobs.
    const done = st.jobs.filter((j) => j.finishAt <= ctx.now)
    for (const job of done) {
      if (cfg.failureRate > 0 && ctx.random() < cfg.failureRate) {
        if (job.attempts <= cfg.maxRetries) {
          job.attempts += 1
          job.finishAt = ctx.now + cfg.processingMs
          s.retries += 1
          continue
        }
        st.jobs = st.jobs.filter((j) => j !== job)
        s.failed += 1
        const dlq = ctx.targets(node.id).find((t) => ctx.nodeType(t) === 'queue')
        if (dlq) {
          job.packet.path.push(node.id)
          ctx.send(node.id, dlq, job.packet)
        } else s.dropped += 1
        continue
      }
      st.jobs = st.jobs.filter((j) => j !== job)
      s.processed += 1
    }

    // Pull new work from upstream queues.
    for (const src of ctx.sources(node.id)) {
      if (ctx.nodeType(src) !== 'queue') continue
      const q = ctx.state<QueueState>(src, initQueue)
      while (st.jobs.length < cfg.capacity && q.items.length > 0) {
        const packet = q.items.shift()!
        packet.path.push(node.id)
        st.jobs.push({ packet, finishAt: ctx.now + cfg.processingMs, attempts: 1 })
        s.in += 1
      }
      ctx.stats(src).queued = q.items.length
    }
    s.active = st.jobs.length
    s.loadPct = Math.round((st.jobs.length / Math.max(1, cfg.capacity)) * 100)
  },
}
