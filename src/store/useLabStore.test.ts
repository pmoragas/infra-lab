import { describe, it, expect, beforeEach } from 'vitest'
import { useLabStore } from './useLabStore'

beforeEach(() => {
  useLabStore.setState({ nodes: [], edges: [], selectedId: null, sim: null })
})

describe('lab store', () => {
  it('adds nodes with default config', () => {
    const s = useLabStore.getState()
    const id = s.addNode('lb', { x: 10, y: 20 })
    const n = useLabStore.getState().nodes.find((n) => n.id === id)!
    expect(n.type).toBe('lb')
    expect(n.data.config).toEqual({ algorithm: 'roundRobin' })
  })

  it('connects and builds a project graph', () => {
    const s = useLabStore.getState()
    const w = s.addNode('world', { x: 0, y: 0 })
    const lb = s.addNode('lb', { x: 0, y: 0 })
    const srv = s.addNode('server', { x: 0, y: 0 })
    s.onConnect({ source: w, target: lb, sourceHandle: null, targetHandle: null })
    s.onConnect({ source: lb, target: srv, sourceHandle: null, targetHandle: null })
    const p = useLabStore.getState().toProject()
    expect(p.nodes.map((n) => n.type)).toEqual(['world', 'lb', 'server'])
    expect(p.edges.map((e) => [e.source, e.target])).toEqual([
      [w, lb],
      [lb, srv],
    ])
  })

  it('removing a node removes its edges', () => {
    const s = useLabStore.getState()
    const w = s.addNode('world', { x: 0, y: 0 })
    const lb = s.addNode('lb', { x: 0, y: 0 })
    s.onConnect({ source: w, target: lb, sourceHandle: null, targetHandle: null })
    s.removeNode(lb)
    const st = useLabStore.getState()
    expect(st.nodes).toHaveLength(1)
    expect(st.edges).toHaveLength(0)
  })

  it('updates a single node config', () => {
    const s = useLabStore.getState()
    const a = s.addNode('server', { x: 0, y: 0 })
    const b = s.addNode('server', { x: 0, y: 0 })
    s.updateNodeConfig(a, { capacity: 9 })
    const st = useLabStore.getState()
    expect(st.nodes.find((n) => n.id === a)!.data.config).toEqual({ capacity: 9, processingMs: 300 })
    expect(st.nodes.find((n) => n.id === b)!.data.config).toEqual({ capacity: 5, processingMs: 300 })
  })
})

describe('lab store: load', () => {
  it('loadProject → toProject round trips and new ids do not collide', () => {
    const s = useLabStore.getState()
    const project = {
      id: 'p9',
      name: 'loaded',
      settings: { seed: 5 },
      nodes: [
        { id: 'world-1', type: 'world' as const, position: { x: 1, y: 2 }, config: { intensity: 'fast' as const } },
        { id: 'server-7', type: 'server' as const, position: { x: 3, y: 4 }, config: { capacity: 2, processingMs: 100 } },
      ],
      edges: [{ id: 'e1', source: 'world-1', target: 'server-7' }],
    }
    s.loadProject(project)
    expect(useLabStore.getState().toProject()).toEqual(project)
    const fresh = useLabStore.getState().addNode('server', { x: 0, y: 0 })
    expect(fresh).toBe('server-8')
  })
})
