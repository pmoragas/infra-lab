import { describe, it, expect } from 'vitest'
import { createEngine } from '../engine'
import { wlsProject } from '../fixtures'

describe('server', () => {
  it('drops packets over capacity and reports loadPct', () => {
    // burst = 1 packet / 50ms, capacity 2, processing 10s → 3rd+ dropped
    const e = createEngine(wlsProject(1, { intensity: 'burst', capacity: 2, processingMs: 10_000 }), { travelMs: 50 })
    for (let i = 0; i < 20; i++) e.step(50) // 1s
    const st = e.getState().stats.servers.s1
    expect(st.active).toBe(2)
    expect(st.loadPct).toBe(100)
    expect(st.dropped).toBeGreaterThan(0)
    expect(st.processed).toBe(0)
  })

  it('finishes jobs after processingMs and counts processed', () => {
    const e = createEngine(wlsProject(1, { intensity: 'slow', capacity: 5, processingMs: 200 }), { travelMs: 100 })
    // emit t=1000, LB t=1100, server t=1200, done t=1400
    for (let i = 0; i < 24; i++) e.step(50) // t=1200
    expect(e.getState().stats.servers.s1.active).toBe(1)
    expect(e.getState().stats.servers.s1.loadPct).toBe(20)
    for (let i = 0; i < 4; i++) e.step(50) // t=1400
    const st = e.getState().stats.servers.s1
    expect(st.active).toBe(0)
    expect(st.processed).toBe(1)
    expect(st.loadPct).toBe(0)
  })
})
