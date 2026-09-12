import { describe, it, expect } from 'vitest'
import { createEngine } from '../engine'
import { wlsProject } from '../fixtures'
import { EMIT_INTERVAL_MS } from './world'
import type { Intensity } from '../types'

describe('world', () => {
  it.each(['slow', 'normal', 'fast', 'burst'] as Intensity[])('%s emits at its interval over 10s', (intensity) => {
    const e = createEngine(wlsProject(1, { intensity }), { travelMs: 50 })
    let emitted = 0
    let lastId = 0
    for (let i = 0; i < 200; i++) {
      e.step(50)
      for (const p of e.getState().packets) {
        const n = Number(p.id.slice(1))
        if (n > lastId) {
          lastId = n
          emitted += 1
        }
      }
    }
    const expected = 10_000 / EMIT_INTERVAL_MS[intensity]
    expect(emitted).toBeGreaterThanOrEqual(expected - 1)
    expect(emitted).toBeLessThanOrEqual(expected + 1)
  })

  it('emits nothing when it has no outgoing edge', () => {
    const p = wlsProject(1)
    p.edges = p.edges.filter((e) => e.source !== 'world')
    const e = createEngine(p)
    for (let i = 0; i < 40; i++) e.step(50)
    expect(e.getState().packets).toHaveLength(0)
  })
})
