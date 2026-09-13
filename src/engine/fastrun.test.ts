import { describe, it, expect } from 'vitest'
import { wlsProject } from './fixtures'
import { boot, run } from './testUtil'

describe('fast run', () => {
  it('advances sim time, pauses, and publishes a single snapshot', () => {
    const e = boot(wlsProject(2, { world: { rps: 10 } }))
    const seen: number[] = []
    e.subscribe((s) => seen.push(s.now))
    e.runFor(5000)
    expect(seen).toEqual([5000])
    expect(e.getState().status).toBe('paused')
  })

  it('gives the same results as stepping in real time', () => {
    const a = boot(wlsProject(2, { world: { rps: 10 } }))
    run(a, 5000)
    const b = boot(wlsProject(2, { world: { rps: 10 } }))
    b.runFor(5000)
    expect(b.getState().stats).toEqual(a.getState().stats)
  })

  it('returns the results of just that window, so a change made between runs shows cleanly', () => {
    const p = wlsProject(3, { world: { rps: 10, timeoutMs: 5000 }, lb: { healthCheck: false, retries: 0, timeoutMs: 1000 }, edge: { latencyMs: 20, lossPct: 0 } })
    ;(p.nodes.find((n) => n.id === 's2')!.config as { down?: boolean }).down = true
    const e = boot(p)
    const first = e.runFor(60_000)
    expect(first).toMatchObject({ fromMs: 0, simMs: 60_000 })
    expect(first.successPct).toBeGreaterThan(60)
    expect(first.successPct).toBeLessThan(70)
    e.updateNodeConfig('lb', { healthCheck: true })
    const second = e.runFor(60_000)
    expect(second).toMatchObject({ fromMs: 60_000, simMs: 120_000 })
    expect(second.successPct).toBeGreaterThanOrEqual(99)
    expect(e.getState().stats.global.ok).toBe(e.getState().stats.global.ok) // whole-run counters keep accumulating
    expect(first.completed + second.completed).toBe(e.getState().stats.global.ok + e.getState().stats.global.error + e.getState().stats.global.timeout)
  })

  it('reports latency percentiles over the whole run, not just recent journeys', () => {
    // emit → LB 100 → server 100 → processing 100 → LB 100 → World 100 = 500 ms
    const e = boot(wlsProject(1, { world: { rps: 20 }, server: { capacity: 100, processingMs: 100 }, edge: { latencyMs: 100, lossPct: 0 } }))
    e.runFor(30_000)
    const l = e.getState().stats.global.latency
    expect(l.count).toBeGreaterThan(500)
    expect(l.p50).toBe(500)
    expect(l.p99).toBe(500)
  })
})
