import { describe, it, expect } from 'vitest'
import { project } from '../fixtures'
import { boot, run } from '../testUtil'

const fast = { latencyMs: 50, lossPct: 0 }

describe('cache / cdn', () => {
  it('inline cache: misses go to origin, then hits are served from cache', () => {
    const p = project()
      .node('w', 'world', { rps: 10, keyspace: 2 })
      .node('c', 'cache', { maxEntries: 10, ttlMs: 60_000, latencyMs: 10 })
      .node('s', 'server', { processingMs: 100, capacity: 100 })
      .edge('w', 'c', fast)
      .edge('c', 's', fast)
      .build()
    const e = boot(p)
    run(e, 5000)
    const c = e.getState().stats.nodes.c
    expect(c.misses).toBeLessThanOrEqual(4) // 2 keys, a couple may miss before the first fill lands
    expect(c.hits).toBeGreaterThan(30)
    expect(e.getState().stats.nodes.s.processed).toBeLessThanOrEqual(4)
  })

  it('TTL expiry causes new misses', () => {
    const p = project()
      .node('w', 'world', { rps: 2, keyspace: 1 })
      .node('c', 'cache', { maxEntries: 10, ttlMs: 1000, latencyMs: 10 })
      .node('s', 'server', { processingMs: 10, capacity: 100 })
      .edge('w', 'c', fast)
      .edge('c', 's', fast)
      .build()
    const e = boot(p)
    run(e, 10_000)
    const c = e.getState().stats.nodes.c
    expect(c.misses).toBeGreaterThanOrEqual(5)
    expect(c.hits).toBeGreaterThan(5)
  })

  it('maxEntries evicts (LRU): keyspace bigger than cache keeps missing', () => {
    const p = project()
      .node('w', 'world', { rps: 20, keyspace: 100 })
      .node('c', 'cache', { maxEntries: 2, ttlMs: 60_000, latencyMs: 10 })
      .node('s', 'server', { processingMs: 10, capacity: 100 })
      .edge('w', 'c', fast)
      .edge('c', 's', fast)
      .build()
    const e = boot(p)
    run(e, 5000)
    const c = e.getState().stats.nodes.c
    expect(c.active).toBe(2)
    expect(c.misses).toBeGreaterThan(c.hits)
  })

  it('cache-aside: server tries cache, on miss goes to database, and later hits skip the database', () => {
    const p = project()
      .node('w', 'world', { rps: 10, keyspace: 3 })
      .node('s', 'server', { processingMs: 10, capacity: 100 })
      .node('c', 'cache', { maxEntries: 10, ttlMs: 60_000, latencyMs: 10 })
      .node('db', 'database', { capacity: 100, latencyMs: 50 })
      .edge('w', 's', fast)
      .edge('s', 'c', fast)
      .edge('s', 'db', fast)
      .build()
    const e = boot(p)
    run(e, 5000)
    const st = e.getState().stats
    expect(st.nodes.db.processed).toBeLessThanOrEqual(6)
    expect(st.nodes.c.hits).toBeGreaterThan(30)
    expect(st.global.ok).toBeGreaterThan(30)
    expect(st.global.error).toBe(0)
  })
})
