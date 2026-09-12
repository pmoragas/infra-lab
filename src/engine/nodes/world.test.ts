import { describe, it, expect } from 'vitest'
import { project, wlsProject } from '../fixtures'
import { boot, run } from '../testUtil'

describe('world', () => {
  it.each([1, 5, 20])('steady %s rps emits that many per second', (rps) => {
    const e = boot(wlsProject(1, { world: { rps } }))
    run(e, 10_000)
    expect(e.getState().stats.global.sent).toBe(rps * 10)
  })

  it('burst pattern emits burstSize every burstEvery', () => {
    const e = boot(wlsProject(1, { world: { pattern: 'burst', burstEvery: 1000, burstSize: 7 } }))
    run(e, 3000)
    expect(e.getState().stats.global.sent).toBe(21)
  })

  it('assigns client ids within `clients` and keys within `keyspace`', () => {
    const e = boot(wlsProject(1, { world: { rps: 20, clients: 3, keyspace: 4 } }))
    const clients = new Set<string>()
    const keys = new Set<number>()
    for (let i = 0; i < 100; i++) {
      e.step(50)
      for (const p of e.getState().packets) {
        clients.add(p.clientId)
        keys.add(p.key)
      }
    }
    expect([...clients].every((c) => ['c1', 'c2', 'c3'].includes(c))).toBe(true)
    expect(clients.size).toBe(3)
    expect(Math.max(...keys)).toBeLessThan(4)
  })

  it('emits nothing when it has no outgoing edge', () => {
    const e = boot(project().node('w', 'world', { rps: 5 }).build())
    run(e, 2000)
    expect(e.getState().packets).toHaveLength(0)
    expect(e.getState().stats.global.errors['no-route']).toBeGreaterThan(0)
  })
})
