import { describe, it, expect, vi } from 'vitest'
import { createEngine } from './engine'
import { wlsProject } from './fixtures'
import type { SimState } from './types'

const run = (engine: ReturnType<typeof createEngine>, ticks: number, dt = 50) => {
  const log: string[] = []
  for (let i = 0; i < ticks; i++) {
    engine.step(dt)
    const s = engine.getState()
    log.push(s.packets.map((p) => `${p.id}:${p.from}>${p.to}@${p.progress.toFixed(2)}:${p.phase}`).join('|'))
  }
  return log
}

describe('engine core', () => {
  it('starts idle with no packets', () => {
    const e = createEngine(wlsProject())
    const s = e.getState()
    expect(s.status).toBe('idle')
    expect(s.packets).toHaveLength(0)
    expect(s.now).toBe(0)
  })

  it('moves a packet along an edge at travelMs', () => {
    // normal intensity emits every 500ms; travelMs 600 → progress 50/600 per tick
    const e = createEngine(wlsProject(1), { travelMs: 600 })
    for (let i = 0; i < 10; i++) e.step(50) // now = 500 → World emits
    const p0 = e.getState().packets[0]
    expect(p0).toBeDefined()
    expect(p0.from).toBe('world')
    expect(p0.to).toBe('lb')
    expect(p0.progress).toBe(0)
    e.step(50)
    expect(e.getState().packets[0].progress).toBeCloseTo(50 / 600)
    e.step(50)
    expect(e.getState().packets[0].progress).toBeCloseTo(100 / 600)
  })

  it('delivers to LB then to a server, then responds back through the LB', () => {
    const e = createEngine(wlsProject(1, { processingMs: 100 }), { travelMs: 100 })
    // t=500 emit; t=600 at LB → forwarded; t=700 at server; t=800 done → response; t=900 at LB → back; t=1000 at world
    for (let i = 0; i < 10; i++) e.step(50)
    expect(e.getState().packets[0].to).toBe('lb')
    for (let i = 0; i < 2; i++) e.step(50)
    expect(e.getState().packets[0].to).toBe('s1')
    for (let i = 0; i < 2; i++) e.step(50)
    expect(e.getState().packets).toHaveLength(0) // being processed
    expect(e.getState().stats.servers.s1.active).toBe(1)
    for (let i = 0; i < 2; i++) e.step(50)
    const resp = e.getState().packets[0]
    expect(resp.phase).toBe('response')
    expect(resp.from).toBe('s1')
    expect(resp.to).toBe('lb')
    for (let i = 0; i < 2; i++) e.step(50)
    expect(e.getState().packets[0].to).toBe('world')
    for (let i = 0; i < 2; i++) e.step(50)
    expect(e.getState().packets.find((p) => p.id === 'p1')).toBeUndefined() // absorbed by World
    expect(e.getState().stats.servers.s1.processed).toBe(1)
  })

  it('is deterministic for the same seed and differs for another seed', () => {
    const a = run(createEngine(wlsProject(3, { algorithm: 'random', seed: 7, intensity: 'fast' })), 60)
    const b = run(createEngine(wlsProject(3, { algorithm: 'random', seed: 7, intensity: 'fast' })), 60)
    const c = run(createEngine(wlsProject(3, { algorithm: 'random', seed: 8, intensity: 'fast' })), 60)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('start ticks on a timer, pause stops it, reset clears everything', () => {
    vi.useFakeTimers()
    const e = createEngine(wlsProject(1), { tickMs: 50 })
    const seen: SimState[] = []
    e.subscribe((s) => seen.push(s))

    e.start()
    expect(e.getState().status).toBe('running')
    vi.advanceTimersByTime(500)
    expect(e.getState().tick).toBe(10)
    expect(e.getState().packets).toHaveLength(1)

    e.pause()
    expect(e.getState().status).toBe('paused')
    vi.advanceTimersByTime(500)
    expect(e.getState().tick).toBe(10)

    e.reset()
    const s = e.getState()
    expect(s.status).toBe('idle')
    expect(s.tick).toBe(0)
    expect(s.now).toBe(0)
    expect(s.packets).toHaveLength(0)
    expect(s.stats).toEqual({ servers: {}, lbs: {} })
    expect(seen.length).toBeGreaterThan(10)
    vi.useRealTimers()
  })

  it('snapshots are immutable copies', () => {
    const e = createEngine(wlsProject(1))
    for (let i = 0; i < 11; i++) e.step(50)
    const s = e.getState()
    s.packets[0].progress = 99
    expect(e.getState().packets[0].progress).not.toBe(99)
  })

  it('removing a node drops its edges and in-flight packets', () => {
    const e = createEngine(wlsProject(1))
    for (let i = 0; i < 11; i++) e.step(50)
    expect(e.getState().packets).toHaveLength(1)
    e.removeNode('lb')
    expect(e.getState().packets).toHaveLength(0)
    for (let i = 0; i < 20; i++) e.step(50)
    expect(e.getState().packets).toHaveLength(0) // world has no target now
  })
})
