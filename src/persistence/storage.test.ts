import { describe, it, expect } from 'vitest'
import { exportJson, importJson } from './storage'
import { wlsProject } from '../engine/fixtures'

describe('import / export', () => {
  it('export → import round trip', () => {
    const p = wlsProject(2)
    expect(importJson(exportJson(p))).toEqual(p)
  })

  it('import rejects wrong shapes', () => {
    expect(() => importJson('{"id":"x"}')).toThrow()
    expect(() => importJson(JSON.stringify({ ...wlsProject(1), nodes: [{ id: 'a', type: 'cdn' }] }))).toThrow()
    expect(() => importJson(JSON.stringify({ ...wlsProject(1), failures: 'nope' }))).toThrow()
  })
})
