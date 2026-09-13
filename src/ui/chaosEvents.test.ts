import { describe, it, expect } from 'vitest'
import { describeEvent, summarizeEvents } from './chaosEvents'
import type { ChaosEvent } from '../engine/types'

const ev = (e: Partial<ChaosEvent> & Pick<ChaosEvent, 'kind' | 'phase' | 'atMs'>): ChaosEvent => ({ failureId: 'f', target: 'x', ...e })

describe('chaos event text', () => {
  it('pairs each failure’s start and end into one line, in the order they happened', () => {
    expect(
      summarizeEvents([
        ev({ failureId: 'a', kind: 'spike', target: 'world-1', phase: 'start', atMs: 15_000 }),
        ev({ failureId: 'b', kind: 'flush', target: 'cache-1', phase: 'start', atMs: 20_000 }),
        ev({ failureId: 'a', kind: 'spike', target: 'world-1', phase: 'end', atMs: 30_000 }),
        ev({ failureId: 'c', kind: 'kill', target: 'server-1', phase: 'start', atMs: 50_000 }),
      ]),
    ).toEqual(['spike world-1 15–30 s', 'flush cache-1 20 s', 'kill server-1 from 50 s'])
  })

  it('describes starts and ends for the banner', () => {
    expect(describeEvent(ev({ kind: 'kill', target: 'server-1', phase: 'start', atMs: 0 }))).toBe('server-1 is down')
    expect(describeEvent(ev({ kind: 'kill', target: 'server-1', phase: 'end', atMs: 0 }))).toBe('server-1 is back up')
    expect(describeEvent(ev({ kind: 'flush', target: 'cache-1', phase: 'start', atMs: 0 }))).toBe('cache cache-1 was flushed')
  })
})
