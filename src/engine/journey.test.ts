import { describe, it, expect } from 'vitest'
import { wlsProject } from './fixtures'
import { boot, run } from './testUtil'

const timed = () => wlsProject(1, { server: { processingMs: 100 }, edge: { latencyMs: 100, lossPct: 0 } })

describe('packet journeys', () => {
  it('records each hop with its time and the final outcome', () => {
    // t=500 emit; 600 at LB; 700 at s1; 800 done; 900 at LB; 1000 at World
    const e = boot(timed())
    run(e, 1100)
    const j = e.getState().journeys[0]
    expect(j.outcome).toBe('ok')
    expect(j.hops.map((h) => [h.node, h.phase])).toEqual([
      ['world', 'request'],
      ['lb', 'request'],
      ['s1', 'request'],
      ['lb', 'response'],
      ['world', 'response'],
    ])
    expect(j.hops.map((h) => h.at)).toEqual([500, 600, 700, 900, 1000])
    expect(j.endedAt! - j.startedAt).toBe(500)
  })

  it('getJourney returns a packet that is still in flight', () => {
    const e = boot(timed())
    run(e, 650)
    const id = e.getState().packets[0].id
    const j = e.getJourney(id)!
    expect(j.outcome).toBeUndefined()
    expect(j.hops.map((h) => h.node)).toEqual(['world', 'lb'])
  })

  it('reset clears journeys', () => {
    const e = boot(timed())
    run(e, 1100)
    e.reset()
    expect(e.getState().journeys).toEqual([])
  })
})
