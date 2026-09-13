import { describe, it, expect } from 'vitest'
import { project } from '../fixtures'
import { boot, run } from '../testUtil'
import type { Journey, Project, Route, ThirdPartyConfig } from '../types'

const fast = { latencyMs: 5, lossPct: 0 }
const carries = (...routes: string[]) => ({ ...fast, routes })

const ROUTES: Route[] = [
  { id: 'browse', name: 'GET /products', kind: 'read' },
  { id: 'reviews', name: 'GET /reviews', kind: 'read' },
  { id: 'checkout', name: 'POST /checkout', kind: 'write' },
]

/** The nodes a request visited after the server, in order. */
const calls = (j: Journey) => j.hops.filter((h) => h.phase === 'request' && !h.lost && h.node !== 'w' && h.node !== 's').map((h) => h.node)

describe('world traffic mix', () => {
  /** World → b (browse link) and k (checkout link), so each server's arrivals count one route. */
  const split = (mix?: Record<string, number>): Project => ({
    ...project()
      .node('w', 'world', { rps: 100, mix })
      .node('b', 'server', { capacity: 1000, processingMs: 10 })
      .node('k', 'server', { capacity: 1000, processingMs: 10 })
      .edge('w', 'b', carries('browse'))
      .edge('w', 'k', carries('checkout'))
      .build(),
    routes: ROUTES,
  })

  it('sends routes in proportion to their weights and records the route on each journey', () => {
    const st = run(boot(split({ browse: 80, checkout: 20 })), 10_000)
    const b = st.stats.nodes.b.in
    const k = st.stats.nodes.k.in
    expect(b / (b + k)).toBeGreaterThan(0.75)
    expect(b / (b + k)).toBeLessThan(0.85)
    expect(new Set(st.journeys.map((j) => j.route))).toEqual(new Set(['browse', 'checkout']))
  })

  it('without a mix, requests carry no route and every link carries them', () => {
    const st = run(boot(split()), 2000)
    expect(st.stats.nodes.b.in).toBeGreaterThan(50)
    expect(st.stats.nodes.k.in).toBeGreaterThan(50)
    expect(st.journeys.every((j) => j.route === undefined)).toBe(true)
  })
})

describe('links carry routes', () => {
  it('a load balancer only picks targets whose link carries the route; untagged links carry every route', () => {
    const p: Project = {
      ...project()
        .node('w', 'world', { rps: 20, mix: { browse: 1, checkout: 1 } })
        .node('lb', 'lb')
        .node('s1', 'server', { capacity: 100, processingMs: 10 })
        .node('s2', 'server', { capacity: 100, processingMs: 10 })
        .edge('w', 'lb', fast)
        .edge('lb', 's1', carries('browse'))
        .edge('lb', 's2', fast)
        .build(),
      routes: ROUTES,
    }
    const st = run(boot(p), 5000)
    const visits = (route: string, node: string) => st.journeys.filter((j) => j.route === route && j.hops.some((h) => h.node === node)).length
    expect(visits('checkout', 's1')).toBe(0)
    expect(visits('checkout', 's2')).toBeGreaterThan(10)
    expect(visits('browse', 's1')).toBeGreaterThan(5)
    expect(visits('browse', 's2')).toBeGreaterThan(5)
  })

  it('a request that no link carries fails with no-route', () => {
    const p: Project = {
      ...project()
        .node('w', 'world', { rps: 10, mix: { checkout: 1 } })
        .node('gw', 'apiGateway', { latencyMs: 5 })
        .node('s', 'server', { processingMs: 10 })
        .edge('w', 'gw', fast)
        .edge('gw', 's', carries('browse'))
        .build(),
      routes: ROUTES,
    }
    const g = run(boot(p), 3000).stats.global
    expect(g.ok).toBe(0)
    expect(g.errors['no-route']).toBeGreaterThan(10)
  })
})

describe('server steps per route', () => {
  /** Browse: cache-aside over the database. Checkout: database, then payment, then the order queue. */
  const shop = (mix: Record<string, number>, pay: Partial<ThirdPartyConfig> = {}): Project => ({
    ...project()
      .node('w', 'world', { rps: 10, keyspace: 3, mix, timeoutMs: 20_000 })
      .node('s', 'server', { capacity: 50, processingMs: 10 })
      .node('c', 'cache', { ttlMs: 60_000, latencyMs: 2 })
      .node('db', 'database', { capacity: 50, latencyMs: 10 })
      .node('pay', 'thirdParty', { latencyMs: 20, jitterMs: 0, failureRate: 0, ...pay })
      .node('q', 'queue', { maxSize: 10_000 })
      .edge('w', 's', fast)
      .edge('s', 'c', carries('browse'))
      .edge('s', 'db', carries('browse', 'checkout'))
      .edge('s', 'pay', carries('checkout'))
      .edge('s', 'q', carries('checkout'))
      .build(),
    routes: ROUTES,
  })

  it('checkout calls the database, then payment, then the queue, and never the cache', () => {
    const st = run(boot(shop({ checkout: 1 })), 5000)
    const ok = st.journeys.filter((j) => j.outcome === 'ok')
    expect(ok.length).toBeGreaterThan(20)
    for (const j of ok) expect(calls(j)).toEqual(['db', 'pay', 'q'])
  })

  it('a failing step fails the request and skips the steps after it', () => {
    const st = run(boot(shop({ checkout: 1 }, { failureRate: 1 })), 5000)
    expect(st.stats.global.ok).toBe(0)
    expect(st.stats.global.errors.failed).toBeGreaterThan(20)
    expect(st.stats.nodes.q?.in ?? 0).toBe(0)
    for (const j of st.journeys) expect(calls(j)).toEqual(['db', 'pay'])
  })

  it('browse does cache-aside over the database and never touches payment or the queue', () => {
    const st = run(boot(shop({ browse: 1 })), 5000)
    expect(st.stats.global.error).toBe(0)
    expect(st.stats.nodes.c.hits).toBeGreaterThan(20)
    expect(st.stats.nodes.db.processed).toBeLessThanOrEqual(6)
    for (const j of st.journeys) expect(['c', 'c,db']).toContain(calls(j).join(','))
  })
})

describe('route kind', () => {
  /** World → database with 10× read capacity, so concurrent queries show whether they ran as reads. */
  const db = (readRatio: number, mix?: Record<string, number>): Project => ({
    ...project()
      .node('w', 'world', { rps: 20, mix })
      .node('db', 'database', { capacity: 1, replicas: 9, latencyMs: 1000, readRatio })
      .edge('w', 'db', fast)
      .build(),
    routes: ROUTES,
  })

  it('the database takes read or write from the route, and falls back to readRatio without one', () => {
    expect(run(boot(db(0, { browse: 1 })), 2000).stats.nodes.db.active).toBe(10)
    expect(run(boot(db(1, { checkout: 1 })), 2000).stats.nodes.db.active).toBe(1)
    expect(run(boot(db(0)), 2000).stats.nodes.db.active).toBe(1)
  })

  /** World → inline cache → server. */
  const inline = (mix: Record<string, number>): Project => ({
    ...project()
      .node('w', 'world', { rps: 10, keyspace: 1, mix })
      .node('c', 'cache', { maxEntries: 10, ttlMs: 60_000, latencyMs: 2 })
      .node('s', 'server', { processingMs: 10, capacity: 100 })
      .edge('w', 'c', fast)
      .edge('c', 's', fast)
      .build(),
    routes: ROUTES,
  })

  it('a cache passes writes through without a lookup and never stores them', () => {
    const st = run(boot(inline({ checkout: 1 })), 5000)
    expect(st.stats.nodes.c.hits + st.stats.nodes.c.misses).toBe(0)
    expect(st.stats.nodes.c.active).toBe(0)
    expect(st.stats.nodes.s.processed).toBeGreaterThan(40)
  })

  it('a cache keeps the same key on two routes apart', () => {
    const st = run(boot(inline({ browse: 1, reviews: 1 })), 5000)
    expect(st.stats.nodes.c.active).toBe(2)
  })
})
