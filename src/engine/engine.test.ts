import { describe, it, expect, vi } from 'vitest'
import { createEngine } from './engine'
import { project, wlsProject } from './fixtures'
import { boot, run } from './testUtil'

describe('engine core', () => {
  it('starts idle with no packets', () => {
    const s = boot(wlsProject()).getState()
    expect(s.status).toBe('idle')
    expect(s.packets).toHaveLength(0)
    expect(s.now).toBe(0)
  })

  it('moves a packet along an edge at the edge latency', () => {
    // rps 2 → first emit at t=500. Edge latency 600 → progress 50/600 per tick.
    const e = boot(wlsProject(1, { edge: { latencyMs: 600, lossPct: 0 } }))
    run(e, 500)
    const p0 = e.getState().packets[0]
    expect(p0.from).toBe('world')
    expect(p0.to).toBe('lb')
    expect(p0.progress).toBe(0)
    e.step(50)
    expect(e.getState().packets[0].progress).toBeCloseTo(50 / 600)
  })

  it('request goes World → LB → server, response returns through the LB', () => {
    const e = boot(wlsProject(1, { server: { processingMs: 100 }, edge: { latencyMs: 100, lossPct: 0 } }))
    // t=500 emit; 600 at LB; 700 at s1; 800 done; 900 at LB; 1000 at World
    run(e, 500)
    expect(e.getState().packets[0].to).toBe('lb')
    run(e, 100)
    expect(e.getState().packets[0].to).toBe('s1')
    run(e, 100)
    expect(e.getState().packets).toHaveLength(0)
    expect(e.getState().stats.nodes.s1.active).toBe(1)
    run(e, 100)
    const r = e.getState().packets[0]
    expect(r.phase).toBe('response')
    expect(r.from).toBe('s1')
    expect(r.to).toBe('lb')
    run(e, 100)
    expect(e.getState().packets[0].to).toBe('world')
    run(e, 100)
    expect(e.getState().stats.global.ok).toBe(1)
  })

  it('is deterministic for the same seed and differs for another seed', () => {
    const log = (seed: number) => {
      const e = boot(wlsProject(3, { lb: { algorithm: 'random' }, world: { rps: 10 }, seed }))
      const out: string[] = []
      for (let i = 0; i < 60; i++) {
        e.step(50)
        out.push(e.getState().packets.map((p) => `${p.id}:${p.to}`).join('|'))
      }
      return out
    }
    expect(log(7)).toEqual(log(7))
    expect(log(7)).not.toEqual(log(8))
  })

  it('start ticks on a timer honouring speed, pause stops it, reset clears everything', () => {
    vi.useFakeTimers()
    const p = wlsProject(1)
    p.settings.speed = 2
    const e = createEngine(p, { tickMs: 50 })
    e.start()
    vi.advanceTimersByTime(500)
    expect(e.getState().tick).toBe(10)
    expect(e.getState().now).toBe(1000) // 2x speed
    e.pause()
    vi.advanceTimersByTime(500)
    expect(e.getState().tick).toBe(10)
    e.reset()
    const s = e.getState()
    expect(s.status).toBe('idle')
    expect(s.now).toBe(0)
    expect(s.packets).toHaveLength(0)
    expect(s.stats.nodes).toEqual({})
    vi.useRealTimers()
  })

  it('link loss drops packets and the World eventually times out', () => {
    const e = boot(wlsProject(1, { world: { rps: 4, timeoutMs: 1000 }, lb: { retries: 0, timeoutMs: 500 }, edge: { latencyMs: 100, lossPct: 100 } }))
    run(e, 3000)
    const s = e.getState()
    expect(s.packets).toHaveLength(0)
    expect(s.stats.global.timeout).toBeGreaterThan(0)
    expect(s.stats.global.ok).toBe(0)
  })

  it('removing a node drops its edges and in-flight packets', () => {
    const e = boot(wlsProject(1))
    run(e, 550)
    expect(e.getState().packets).toHaveLength(1)
    e.removeNode('lb')
    expect(e.getState().packets).toHaveLength(0)
    run(e, 1000)
    expect(e.getState().packets).toHaveLength(0)
  })

  it('fills in defaults for partial configs (older saved projects)', () => {
    const p = project().node('w', 'world', { rps: 1 }).build()
    p.nodes[0].config = { rps: 1 } as never
    expect(() => boot(p).step(50)).not.toThrow()
  })
})
