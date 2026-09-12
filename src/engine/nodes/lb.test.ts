import { describe, it, expect } from 'vitest'
import { wlsProject } from '../fixtures'
import { boot, run } from '../testUtil'
import type { ConfigByType } from '../types'

const per = (lb: Partial<ConfigByType['lb']>, servers = 3, ms = 3000, world: Partial<ConfigByType['world']> = {}) => {
  const e = boot(wlsProject(servers, { lb, world: { rps: 10, ...world }, server: { capacity: 100, processingMs: 100 } }))
  run(e, ms)
  return e.getState().stats.nodes.lb.perTarget
}

describe('lb algorithms', () => {
  it('round robin spreads evenly', () => {
    const p = per({ algorithm: 'roundRobin' })
    const counts = Object.values(p)
    expect(counts).toHaveLength(3)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('weighted round robin follows weights', () => {
    const p = per({ algorithm: 'weightedRoundRobin', weights: { s1: 3, s2: 1, s3: 1 } }, 3, 5000)
    expect(p.s1).toBeGreaterThanOrEqual(p.s2 * 2.5)
    expect(Math.abs(p.s2 - p.s3)).toBeLessThanOrEqual(1)
  })

  it('ip hash keeps a client on the same server', () => {
    const e = boot(wlsProject(3, { lb: { algorithm: 'ipHash' }, world: { rps: 10, clients: 4 }, server: { capacity: 100 } }))
    const seen = new Map<string, Set<string>>()
    for (let i = 0; i < 100; i++) {
      e.step(50)
      for (const p of e.getState().packets) {
        if (p.from !== 'lb' || p.phase !== 'request') continue
        if (!seen.has(p.clientId)) seen.set(p.clientId, new Set())
        seen.get(p.clientId)!.add(p.to)
      }
    }
    expect(seen.size).toBeGreaterThan(1)
    for (const targets of seen.values()) expect(targets.size).toBe(1)
  })

  it('least connections favours the fast server', () => {
    const p = wlsProject(2, { lb: { algorithm: 'leastConnections' }, world: { rps: 10 }, server: { capacity: 50 } })
    ;(p.nodes.find((n) => n.id === 's1')!.config as ConfigByType['server']).processingMs = 2000
    ;(p.nodes.find((n) => n.id === 's2')!.config as ConfigByType['server']).processingMs = 100
    const e = boot(p)
    run(e, 10_000)
    const t = e.getState().stats.nodes.lb.perTarget
    expect(t.s2).toBeGreaterThan(t.s1 * 2)
  })

  it('random is seeded and hits more than one server', () => {
    const a = per({ algorithm: 'random' })
    const b = per({ algorithm: 'random' })
    expect(a).toEqual(b)
    expect(Object.keys(a).length).toBeGreaterThan(1)
  })
})

describe('lb health, timeout, retries', () => {
  it('health check skips a down server', () => {
    const p = wlsProject(2, { lb: { healthCheck: true }, world: { rps: 10 } })
    ;(p.nodes.find((n) => n.id === 's1')!.config as ConfigByType['server']).down = true
    const e = boot(p)
    run(e, 3000)
    const t = e.getState().stats.nodes.lb.perTarget
    expect(t.s1).toBeUndefined()
    expect(t.s2).toBeGreaterThanOrEqual(25)
  })

  it('without health check, a down server causes timeouts and retries', () => {
    const p = wlsProject(2, {
      lb: { healthCheck: false, timeoutMs: 500, retries: 1, algorithm: 'roundRobin' },
      world: { rps: 2, timeoutMs: 10_000 },
      edge: { latencyMs: 50, lossPct: 0 },
    })
    ;(p.nodes.find((n) => n.id === 's1')!.config as ConfigByType['server']).down = true
    const e = boot(p)
    run(e, 6000)
    const lb = e.getState().stats.nodes.lb
    expect(lb.timeouts).toBeGreaterThan(0)
    expect(lb.retries).toBeGreaterThan(0)
    expect(e.getState().stats.global.ok).toBeGreaterThan(0) // retries landed on s2
  })

  it('exhausted retries return a timeout error to the World', () => {
    const p = wlsProject(1, {
      lb: { healthCheck: false, timeoutMs: 300, retries: 0 },
      world: { rps: 2, timeoutMs: 10_000 },
      edge: { latencyMs: 50, lossPct: 0 },
    })
    ;(p.nodes.find((n) => n.id === 's1')!.config as ConfigByType['server']).down = true
    const e = boot(p)
    run(e, 3000)
    expect(e.getState().stats.global.timeout).toBeGreaterThan(0)
  })

  it('retries a server failure on another server', () => {
    const p = wlsProject(2, { lb: { retries: 1 }, world: { rps: 5 }, server: { processingMs: 50 }, edge: { latencyMs: 50, lossPct: 0 } })
    ;(p.nodes.find((n) => n.id === 's1')!.config as ConfigByType['server']).failureRate = 1
    const e = boot(p)
    run(e, 4000)
    const s = e.getState().stats
    expect(s.nodes.lb.retries).toBeGreaterThan(0)
    expect(s.global.ok).toBeGreaterThan(0)
  })
})
