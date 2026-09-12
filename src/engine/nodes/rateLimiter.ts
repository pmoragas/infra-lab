import type { NodeHandler, RateLimiterConfig } from '../types'
import { enter, forward } from './util'

interface Bucket {
  tokens: number
  last: number
  windowStart: number
  count: number
  stamps: number[]
}

interface RlState {
  buckets: Map<string, Bucket>
}

function allow(cfg: RateLimiterConfig, b: Bucket, now: number): boolean {
  switch (cfg.algorithm) {
    case 'fixedWindow': {
      if (now - b.windowStart >= 1000) {
        b.windowStart = now
        b.count = 0
      }
      if (b.count < cfg.burst) {
        b.count += 1
        return true
      }
      return false
    }
    case 'slidingWindow': {
      b.stamps = b.stamps.filter((t) => now - t < 1000)
      if (b.stamps.length < cfg.burst) {
        b.stamps.push(now)
        return true
      }
      return false
    }
    case 'tokenBucket':
    default: {
      b.tokens = Math.min(cfg.burst, b.tokens + ((now - b.last) / 1000) * cfg.ratePerSec)
      b.last = now
      if (b.tokens >= 1) {
        b.tokens -= 1
        return true
      }
      return false
    }
  }
}

export const rateLimiterHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as RateLimiterConfig
    const st = ctx.state<RlState>(node.id, () => ({ buckets: new Map() }))
    if (packet.phase === 'response') {
      ctx.respond(node.id, packet)
      return
    }
    enter(node, packet)
    const key = cfg.perClient ? packet.clientId : '*'
    let b = st.buckets.get(key)
    if (!b) {
      b = { tokens: cfg.burst, last: ctx.now, windowStart: ctx.now, count: 0, stamps: [] }
      st.buckets.set(key, b)
    }
    if (allow(cfg, b, ctx.now)) forward(node, packet, ctx)
    else {
      ctx.stats(node.id).rejected += 1
      ctx.respond(node.id, packet, 'error', 'rate-limited')
    }
  },
  tick() {},
}
