import { describe, it, expect } from 'vitest'
import { EXAMPLES } from './examples'
import { importJson } from '../persistence/storage'
import { boot, run } from '../engine/testUtil'

describe('bundled examples', () => {
  it('are found', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(2)
  })

  it.each(EXAMPLES.map((p) => [p.name, p] as const))('%s is a valid project where every wired-up component gets traffic', (_name, example) => {
    const p = importJson(JSON.stringify(example))
    const s = run(boot(p), 30_000)
    const consumers = new Set(p.nodes.filter((n) => n.type === 'consumer').map((n) => n.id))
    const deadLetter = new Set(p.edges.filter((e) => consumers.has(e.source)).map((e) => e.target))
    const fed = new Set(p.edges.map((e) => e.target))
    for (const n of p.nodes) {
      const unwired = n.type !== 'world' && !fed.has(n.id) // placed on purpose for a lesson step
      const down = (n.config as { down?: boolean }).down === true
      if (unwired || down || deadLetter.has(n.id)) continue
      expect(s.stats.nodes[n.id]?.in ?? 0, `${example.name}: ${n.id}`).toBeGreaterThan(0)
    }
    expect(s.stats.global.ok, `${example.name}: some requests succeed`).toBeGreaterThan(0)
  })
})
