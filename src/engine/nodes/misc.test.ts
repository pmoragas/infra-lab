import { describe, it, expect } from 'vitest'
import { project } from '../fixtures'
import { boot, run } from '../testUtil'

const fast = { latencyMs: 50, lossPct: 0 }

describe('api gateway', () => {
  it('adds latency and rejects by authFailRate', () => {
    const p = project()
      .node('w', 'world', { rps: 10 })
      .node('gw', 'apiGateway', { latencyMs: 100, authFailRate: 0.5 })
      .node('s', 'server', { processingMs: 10, capacity: 100 })
      .edge('w', 'gw', fast)
      .edge('gw', 's', fast)
      .build()
    const e = boot(p)
    run(e, 5000)
    const st = e.getState().stats
    expect(st.nodes.gw.rejected).toBeGreaterThan(10)
    expect(st.global.errors.unauthorized).toBe(st.nodes.gw.rejected)
    expect(st.global.ok).toBeGreaterThan(10)
  })
})

describe('database', () => {
  it('replicas add read capacity', () => {
    const build = (replicas: number) =>
      project()
        .node('w', 'world', { rps: 20, timeoutMs: 60_000 })
        .node('db', 'database', { capacity: 1, latencyMs: 500, replicas, readRatio: 1 })
        .edge('w', 'db', fast)
        .build()
    const a = boot(build(0))
    const b = boot(build(3))
    run(a, 5000)
    run(b, 5000)
    expect(b.getState().stats.nodes.db.processed).toBeGreaterThan(a.getState().stats.nodes.db.processed * 2)
    expect(a.getState().stats.nodes.db.queued).toBeGreaterThan(b.getState().stats.nodes.db.queued)
  })

  it('down database answers nothing', () => {
    const p = project().node('w', 'world', { rps: 5, timeoutMs: 500 }).node('db', 'database', { down: true }).edge('w', 'db', fast).build()
    const e = boot(p)
    run(e, 3000)
    expect(e.getState().stats.nodes.db.processed).toBe(0)
    expect(e.getState().stats.global.timeout).toBeGreaterThan(0)
  })
})

describe('queue + consumer', () => {
  const build = (o: { failureRate?: number; maxRetries?: number; dlq?: boolean; maxSize?: number } = {}) => {
    const p = project()
      .node('w', 'world', { rps: 10 })
      .node('q', 'queue', { maxSize: o.maxSize ?? 100 })
      .node('c', 'consumer', { capacity: 2, processingMs: 100, failureRate: o.failureRate ?? 0, maxRetries: o.maxRetries ?? 0 })
      .edge('w', 'q', fast)
      .edge('q', 'c', fast)
    if (o.dlq) p.node('dlq', 'queue', { maxSize: 100 }).edge('c', 'dlq', fast)
    return p.build()
  }

  it('producers get an immediate ok; consumer drains the queue', () => {
    const e = boot(build())
    run(e, 5000)
    const st = e.getState().stats
    expect(st.global.ok).toBeGreaterThan(40)
    expect(st.nodes.c.processed).toBeGreaterThan(30)
    expect(st.nodes.q.queued).toBeLessThan(10)
  })

  it('full queue rejects with queue-full', () => {
    const p = build({ maxSize: 3 })
    ;(p.nodes.find((n) => n.id === 'c')!.config as { processingMs: number }).processingMs = 100_000
    const e = boot(p)
    run(e, 3000)
    expect(e.getState().stats.global.errors['queue-full']).toBeGreaterThan(0)
  })

  it('consumer retries then dead-letters to the DLQ', () => {
    const e = boot(build({ failureRate: 1, maxRetries: 2, dlq: true }))
    run(e, 5000)
    const st = e.getState().stats
    expect(st.nodes.c.retries).toBeGreaterThan(0)
    expect(st.nodes.c.failed).toBeGreaterThan(0)
    expect(st.nodes.dlq.queued).toBe(st.nodes.c.failed)
  })
})

describe('dns', () => {
  it('first lookup per client pays latency, later ones are cached', () => {
    const p = project()
      .node('w', 'world', { rps: 10, clients: 2 })
      .node('d', 'dns', { latencyMs: 300, ttlMs: 60_000 })
      .node('s', 'server', { processingMs: 10, capacity: 100 })
      .edge('w', 'd', fast)
      .edge('d', 's', fast)
      .build()
    const e = boot(p)
    run(e, 5000)
    const d = e.getState().stats.nodes.d
    expect(d.misses).toBe(2)
    expect(d.hits).toBeGreaterThan(40)
  })
})

describe('circuit breaker', () => {
  it('opens after failures, rejects fast, then closes when the dependency recovers', () => {
    const p = project()
      .node('w', 'world', { rps: 10 })
      .node('cb', 'circuitBreaker', { failureThreshold: 3, windowMs: 5000, openMs: 1000 })
      .node('tp', 'thirdParty', { latencyMs: 50, jitterMs: 0, failureRate: 1 })
      .edge('w', 'cb', fast)
      .edge('cb', 'tp', fast)
      .build()
    const e = boot(p)
    run(e, 2000)
    let st = e.getState().stats
    expect(st.nodes.cb.state).not.toBe('closed')
    expect(st.global.errors['circuit-open']).toBeGreaterThan(0)
    const rejectedWhileOpen = st.nodes.cb.rejected

    e.updateNodeConfig('tp', { failureRate: 0 })
    run(e, 4000)
    st = e.getState().stats
    expect(st.nodes.cb.state).toBe('closed')
    expect(st.global.ok).toBeGreaterThan(10)
    expect(st.nodes.cb.rejected).toBeGreaterThanOrEqual(rejectedWhileOpen)
  })
})

describe('third-party api', () => {
  it('answers with latency+jitter and fails by failureRate', () => {
    const p = project()
      .node('w', 'world', { rps: 10 })
      .node('tp', 'thirdParty', { latencyMs: 100, jitterMs: 100, failureRate: 0.3 })
      .edge('w', 'tp', fast)
      .build()
    const e = boot(p)
    run(e, 5000)
    const st = e.getState().stats
    expect(st.nodes.tp.failed).toBeGreaterThan(5)
    expect(st.global.ok).toBeGreaterThan(20)
    expect(st.global.errors.failed).toBe(st.nodes.tp.failed)
  })
})
