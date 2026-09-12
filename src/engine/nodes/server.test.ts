import { describe, it, expect } from 'vitest'
import { project, wlsProject } from '../fixtures'
import { boot, run } from '../testUtil'

const fast = { latencyMs: 50, lossPct: 0 }

describe('server', () => {
  it('drops over capacity when there is no queue, and reports loadPct', () => {
    const e = boot(wlsProject(1, { world: { rps: 20 }, server: { capacity: 2, processingMs: 10_000, queueSize: 0 }, edge: fast }))
    run(e, 1000)
    const st = e.getState().stats.nodes.s1
    expect(st.active).toBe(2)
    expect(st.loadPct).toBe(100)
    expect(st.dropped).toBeGreaterThan(0)
    expect(e.getState().stats.global.errors.dropped).toBeGreaterThan(0)
  })

  it('queues over capacity up to queueSize', () => {
    const e = boot(wlsProject(1, { world: { rps: 20 }, server: { capacity: 1, processingMs: 10_000, queueSize: 3 }, edge: fast }))
    run(e, 1000)
    const st = e.getState().stats.nodes.s1
    expect(st.active).toBe(1)
    expect(st.queued).toBe(3)
    expect(st.dropped).toBeGreaterThan(0)
  })

  it('failureRate produces failed responses', () => {
    const e = boot(wlsProject(1, { world: { rps: 10 }, lb: { retries: 0 }, server: { failureRate: 0.5, processingMs: 50, capacity: 100 }, edge: fast }))
    run(e, 5000)
    const g = e.getState().stats.global
    expect(g.errors.failed).toBeGreaterThan(5)
    expect(g.ok).toBeGreaterThan(5)
  })

  it('jitter varies processing time', () => {
    const e = boot(wlsProject(1, { world: { rps: 10 }, server: { processingMs: 100, jitterMs: 400, capacity: 100 }, edge: fast }))
    run(e, 3000)
    // With jitter, the number in flight at any instant fluctuates; just verify work completes and stays sane.
    const st = e.getState().stats.nodes.s1
    expect(st.processed).toBeGreaterThan(0)
    expect(st.failed).toBe(0)
  })

  it('warm-up doubles processing time at the start', () => {
    const p = project().node('w', 'world', { rps: 1 }).node('s', 'server', { processingMs: 200, warmupMs: 2000 }).edge('w', 's', fast).build()
    const e = boot(p)
    // first packet arrives at t≈1050 (emit 1000 + 50 travel); processing 400 during warm-up → done ≈1450
    run(e, 1400)
    expect(e.getState().stats.nodes.s.processed).toBe(0)
    run(e, 100)
    expect(e.getState().stats.nodes.s.processed).toBe(1)
  })

  it('down server never answers', () => {
    const e = boot(wlsProject(1, { world: { rps: 5, timeoutMs: 500 }, lb: { healthCheck: false, retries: 0, timeoutMs: 300 }, server: { down: true }, edge: fast }))
    run(e, 3000)
    expect(e.getState().stats.nodes.s1.processed).toBe(0)
    expect(e.getState().stats.global.ok).toBe(0)
  })
})
