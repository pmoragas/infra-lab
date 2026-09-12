import { describe, it, expect } from 'vitest'
import { project } from '../fixtures'
import { boot, run } from '../testUtil'
import type { RateAlgorithm } from '../types'

const fast = { latencyMs: 50, lossPct: 0 }

function build(algorithm: RateAlgorithm, perClient = false, clients = 1) {
  return project()
    .node('w', 'world', { rps: 20, clients })
    .node('rl', 'rateLimiter', { algorithm, ratePerSec: 5, burst: 5, perClient })
    .node('s', 'server', { processingMs: 10, capacity: 100 })
    .edge('w', 'rl', fast)
    .edge('rl', 's', fast)
    .build()
}

describe('rate limiter', () => {
  it.each(['tokenBucket', 'fixedWindow', 'slidingWindow'] as RateAlgorithm[])('%s lets ~5/s through of 20/s', (alg) => {
    const e = boot(build(alg))
    run(e, 10_000)
    const rl = e.getState().stats.nodes.rl
    expect(rl.out).toBeGreaterThanOrEqual(40)
    expect(rl.out).toBeLessThanOrEqual(60)
    expect(rl.rejected).toBeGreaterThan(100)
    expect(e.getState().stats.global.errors['rate-limited']).toBeGreaterThanOrEqual(rl.rejected - 2)
  })

  it('perClient gives each client its own allowance', () => {
    const e = boot(build('tokenBucket', true, 4))
    run(e, 10_000)
    const rl = e.getState().stats.nodes.rl
    expect(rl.out).toBeGreaterThan(150) // ~4 × 5/s × 10s
  })
})
