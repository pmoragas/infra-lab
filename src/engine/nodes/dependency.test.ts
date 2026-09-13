import { describe, it, expect } from 'vitest'
import { project } from '../fixtures'
import { boot } from '../testUtil'
import type { Failure, Project } from '../types'

const fast = { latencyMs: 5, lossPct: 0 }

/** World → server doing cache-aside over a cache and a database. */
const build = (failures: Failure[] = []): Project => ({
  ...project()
    .node('w', 'world', { rps: 20, keyspace: 5, timeoutMs: 20_000 })
    .node('s1', 'server', { capacity: 20, processingMs: 20, queueSize: 100, cacheTimeoutMs: 200, backendTimeoutMs: 2000 })
    .node('c', 'cache', { ttlMs: 60_000, latencyMs: 2 })
    .node('db', 'database', { capacity: 50, latencyMs: 20 })
    .edge('w', 's1', fast)
    .edge('s1', 'c', fast)
    .edge('s1', 'db', fast)
    .build(),
  failures,
})

const killed = (p: Project, id: string) => {
  ;(p.nodes.find((n) => n.id === id)!.config as { down?: boolean }).down = true
  return p
}

describe('server dependency timeouts', () => {
  it('a dead cache counts as a miss after the cache timeout: slower, but requests still succeed', () => {
    const healthy = boot(build()).runFor(30_000)
    const deadCache = boot(killed(build(), 'c')).runFor(30_000)
    expect(healthy.successPct).toBe(100)
    expect(deadCache.successPct).toBeGreaterThanOrEqual(99)
    expect(deadCache.p50).toBeGreaterThan(healthy.p50 + 150) // each request first waits on the dead cache
    expect(deadCache.p50).toBeLessThan(healthy.p50 + 600)
  })

  it('a cut link to the cache falls back to the database the same way', () => {
    const cut = build([{ id: 'f', kind: 'partition', target: 'e-s1-c', atMs: 0, durationMs: 60_000, factor: 1 }])
    expect(boot(cut).runFor(30_000).successPct).toBeGreaterThanOrEqual(99)
  })

  it('a dead database fails requests after the backend timeout instead of jamming the server, which recovers', () => {
    const e = boot(killed(build(), 'db'))
    const dead = e.runFor(30_000)
    expect(dead.successPct).toBe(0)
    expect(e.getState().stats.nodes.s1.timeouts).toBeGreaterThan(0)
    e.updateNodeConfig('db', { down: false })
    e.runFor(10_000) // let the backlog from the outage clear
    expect(e.runFor(30_000).successPct).toBeGreaterThanOrEqual(99)
  })
})
