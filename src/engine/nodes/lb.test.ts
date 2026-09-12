import { describe, it, expect } from 'vitest'
import { createEngine } from '../engine'
import { wlsProject } from '../fixtures'

/** Run until `n` packets have been routed by the LB. */
function routeN(n: number, o: Parameters<typeof wlsProject>[1] = {}, servers = 3) {
  const e = createEngine(wlsProject(servers, { intensity: 'fast', ...o }), { travelMs: 100 })
  const order: string[] = []
  let last = 0
  for (let i = 0; i < 10_000 && order.length < n; i++) {
    e.step(50)
    const s = e.getState()
    const routed = s.stats.lbs.lb?.routed ?? 0
    if (routed > last) {
      // the packet just routed is the newest one heading to a server
      const p = s.packets.filter((p) => p.from === 'lb' && p.phase === 'request').at(-1)!
      order.push(p.to)
      last = routed
    }
  }
  return { order, stats: e.getState().stats }
}

describe('lb: round robin', () => {
  it('6 packets, 3 servers → 2 each, in order', () => {
    const { order, stats } = routeN(6, { algorithm: 'roundRobin' })
    expect(order).toEqual(['s1', 's2', 's3', 's1', 's2', 's3'])
    expect(stats.lbs.lb.perServer).toEqual({ s1: 2, s2: 2, s3: 2 })
  })
})

describe('lb: random', () => {
  it('is seeded: same seed same order, hits more than one server', () => {
    const a = routeN(12, { algorithm: 'random', seed: 3 }).order
    const b = routeN(12, { algorithm: 'random', seed: 3 }).order
    expect(a).toEqual(b)
    expect(new Set(a).size).toBeGreaterThan(1)
  })
})

describe('lb: least connections', () => {
  it('sends fewer packets to a slow server', () => {
    const project = wlsProject(2, { algorithm: 'leastConnections', intensity: 'fast', capacity: 50 })
    // s1 slow, s2 fast
    ;(project.nodes.find((n) => n.id === 's1')!.config as { processingMs: number }).processingMs = 2000
    ;(project.nodes.find((n) => n.id === 's2')!.config as { processingMs: number }).processingMs = 100
    const e = createEngine(project, { travelMs: 100 })
    for (let i = 0; i < 400; i++) e.step(50) // 20s
    const per = e.getState().stats.lbs.lb.perServer
    expect(per.s2).toBeGreaterThan(per.s1 * 2)
  })

  it('equals round robin when all servers are idle and equal', () => {
    const { order } = routeN(3, { algorithm: 'leastConnections', processingMs: 10 })
    // ties resolve to first server with the fewest active connections
    expect(order[0]).toBe('s1')
  })
})
