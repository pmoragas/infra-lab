import { describe, it, expect } from 'vitest'
import { project, wlsProject } from './fixtures'
import { boot, run } from './testUtil'
import type { Failure } from './types'

const fast = { latencyMs: 50, lossPct: 0 }
const failure = (f: Partial<Failure> & Pick<Failure, 'kind' | 'target'>): Failure => ({ id: 'f', atMs: 0, durationMs: 1000, factor: 1, ...f })

describe('failure injection', () => {
  it('any node can be toggled down: a down LB answers nothing', () => {
    const p = wlsProject(1, { world: { rps: 5, timeoutMs: 500 }, edge: fast })
    ;(p.nodes.find((n) => n.id === 'lb')!.config as { down?: boolean }).down = true
    const s = run(boot(p), 2000)
    expect(s.stats.nodes.lb.dropped).toBeGreaterThan(0)
    expect(s.stats.nodes.s1?.in ?? 0).toBe(0)
    expect(s.stats.global.ok).toBe(0)
    expect(s.chaos.down).toEqual(['lb'])
  })

  it('scheduled kill takes a server down for its window, then it serves again', () => {
    const p = {
      ...wlsProject(1, { world: { rps: 10 }, lb: { healthCheck: false, retries: 0, timeoutMs: 300 }, server: { processingMs: 20 }, edge: fast }),
      failures: [failure({ kind: 'kill', target: 's1', atMs: 1000, durationMs: 2000 })],
    }
    const e = boot(p)
    run(e, 1500)
    expect(e.getState().chaos.down).toEqual(['s1'])
    expect(e.getState().stats.nodes.s1.dropped).toBeGreaterThan(0)
    run(e, 2000)
    expect(e.getState().chaos.down).toEqual([])
    const before = e.getState().stats.nodes.s1.processed
    run(e, 1000)
    expect(e.getState().stats.nodes.s1.processed).toBeGreaterThan(before)
  })

  it('partition cuts a link: packets on it are lost and the journey shows where', () => {
    const p = {
      ...wlsProject(1, { world: { rps: 5, timeoutMs: 800 }, lb: { retries: 0, timeoutMs: 400 }, edge: fast }),
      failures: [failure({ kind: 'partition', target: 'e-lb-s1', durationMs: 60_000 })],
    }
    const s = run(boot(p), 3000)
    expect(s.chaos.cut).toEqual(['e-lb-s1'])
    expect(s.stats.nodes.s1?.in ?? 0).toBe(0)
    expect(s.stats.global.ok).toBe(0)
    expect(s.journeys.length).toBeGreaterThan(0)
    expect(s.journeys[0].hops.some((h) => h.node === 's1' && h.lost)).toBe(true)
  })

  it('spike multiplies a World’s traffic only during its window', () => {
    const base = wlsProject(1, { world: { rps: 4 }, edge: fast })
    const plain = run(boot(base), 4000).stats.global.sent
    const spiked = run(boot({ ...base, failures: [failure({ kind: 'spike', target: 'world', atMs: 1000, durationMs: 2000, factor: 5 })] }), 4000)
      .stats.global.sent
    expect(plain).toBe(16)
    expect(spiked).toBeGreaterThan(40)
  })

  it('logs when scheduled failures start and end, and each fast-run window lists its own', () => {
    const p = {
      ...wlsProject(1, { world: { rps: 2 }, edge: fast }),
      failures: [failure({ kind: 'spike', target: 'world', atMs: 15_000, durationMs: 15_000, factor: 2 }), failure({ id: 'f2', kind: 'flush', target: 's1', atMs: 20_000 })],
    }
    const e = boot(p)
    const first = e.runFor(60_000)
    const log = [
      ['spike', 'start', 15_000],
      ['flush', 'start', 20_000],
      ['spike', 'end', 30_000],
    ]
    expect(e.getState().events.map((x) => [x.kind, x.phase, x.atMs])).toEqual(log)
    expect(first.events!.map((x) => [x.kind, x.phase, x.atMs])).toEqual(log)
    expect(e.runFor(60_000).events).toEqual([])
    e.reset()
    expect(e.getState().events).toEqual([])
  })

  it('flush empties a cache at its time, so the next reads miss', () => {
    const build = (failures: Failure[] = []) => ({
      ...project()
        .node('w', 'world', { rps: 10, keyspace: 2 })
        .node('c', 'cache', { ttlMs: 60_000, latencyMs: 5 })
        .node('db', 'database', { latencyMs: 20, capacity: 50 })
        .edge('w', 'c', fast)
        .edge('c', 'db', fast)
        .build(),
      failures,
    })
    const misses = (failures?: Failure[]) => run(boot(build(failures)), 4000).stats.nodes.c.misses
    expect(misses([failure({ kind: 'flush', target: 'c', atMs: 2000 })])).toBeGreaterThan(misses())
  })
})
