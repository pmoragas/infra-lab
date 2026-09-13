import { describe, it, expect } from 'vitest'
import { deleteProject, listProjects, loadProject, migrateLegacy, saveProject } from './projects'
import { wlsProject } from '../engine/fixtures'

function memStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('projects', () => {
  it('saves several projects and lists them, most recently saved first', () => {
    const st = memStorage()
    saveProject({ ...wlsProject(1), id: 'a', name: 'A' }, st, 1)
    saveProject({ ...wlsProject(2), id: 'b', name: 'B' }, st, 2)
    expect(listProjects(st).map((m) => m.id)).toEqual(['b', 'a'])
    saveProject({ ...wlsProject(1), id: 'a', name: 'A2' }, st, 3)
    expect(listProjects(st)).toEqual([
      { id: 'a', name: 'A2', updatedAt: 3 },
      { id: 'b', name: 'B', updatedAt: 2 },
    ])
  })

  it('load is a deep-equal round trip; missing or corrupt gives null', () => {
    const st = memStorage()
    const p = { ...wlsProject(3, { lb: { algorithm: 'leastConnections' }, seed: 9 }), id: 'x' }
    saveProject(p, st)
    expect(loadProject('x', st)).toEqual(p)
    expect(loadProject('nope', st)).toBeNull()
    st.setItem('infra-lab:project:bad', '{not json')
    expect(loadProject('bad', st)).toBeNull()
  })

  it('delete removes the project and its list entry', () => {
    const st = memStorage()
    saveProject({ ...wlsProject(1), id: 'a' }, st)
    saveProject({ ...wlsProject(1), id: 'b' }, st)
    deleteProject('a', st)
    expect(listProjects(st).map((m) => m.id)).toEqual(['b'])
    expect(loadProject('a', st)).toBeNull()
  })

  it('moves the single pre-multi-project save into the list once', () => {
    const st = memStorage()
    const p = { ...wlsProject(1), id: 'default', name: 'Old' }
    st.setItem('infra-lab:project', JSON.stringify(p))
    migrateLegacy(st)
    migrateLegacy(st)
    expect(listProjects(st).map((m) => m.name)).toEqual(['Old'])
    expect(loadProject('default', st)).toEqual(p)
    expect(st.getItem('infra-lab:project')).toBeNull()
  })
})
