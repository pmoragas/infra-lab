import { describe, it, expect } from 'vitest'
import { saveProject, loadProject, exportJson, importJson, clearProject } from './storage'
import { wlsProject } from '../engine/fixtures'

function memStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('persistence', () => {
  it('save → load is a deep-equal round trip', () => {
    const st = memStorage()
    const p = wlsProject(3, { lb: { algorithm: 'leastConnections' }, seed: 9 })
    saveProject(p, st)
    expect(loadProject(st)).toEqual(p)
  })

  it('load returns null when empty or corrupt', () => {
    const st = memStorage()
    expect(loadProject(st)).toBeNull()
    st.setItem('infra-lab:project', '{not json')
    expect(loadProject(st)).toBeNull()
    clearProject(st)
    expect(loadProject(st)).toBeNull()
  })

  it('export → import round trip', () => {
    const p = wlsProject(2)
    expect(importJson(exportJson(p))).toEqual(p)
  })

  it('import rejects wrong shapes', () => {
    expect(() => importJson('{"id":"x"}')).toThrow()
    expect(() => importJson(JSON.stringify({ ...wlsProject(1), nodes: [{ id: 'a', type: 'cdn' }] }))).toThrow()
  })
})
