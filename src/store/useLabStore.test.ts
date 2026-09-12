import { describe, it, expect, beforeEach } from 'vitest'
import { useLabStore } from './useLabStore'

beforeEach(() => {
  useLabStore.setState({ nodes: [], edges: [], selectedId: null, selectedEdgeId: null, sim: null })
})

const conn = (source: string, target: string) => ({ source, target, sourceHandle: null, targetHandle: null })

describe('lab store', () => {
  it('adds nodes with default config', () => {
    const s = useLabStore.getState()
    const id = s.addNode('lb', { x: 10, y: 20 })
    const n = useLabStore.getState().nodes.find((n) => n.id === id)!
    expect(n.type).toBe('lb')
    expect(n.data.config).toMatchObject({ algorithm: 'roundRobin', retries: 1, healthCheck: true })
  })

  it('connects with default edge config and builds a project graph', () => {
    const s = useLabStore.getState()
    const w = s.addNode('world', { x: 0, y: 0 })
    const lb = s.addNode('lb', { x: 0, y: 0 })
    const srv = s.addNode('server', { x: 0, y: 0 })
    s.onConnect(conn(w, lb))
    s.onConnect(conn(lb, srv))
    const p = useLabStore.getState().toProject()
    expect(p.nodes.map((n) => n.type)).toEqual(['world', 'lb', 'server'])
    expect(p.edges.map((e) => [e.source, e.target])).toEqual([
      [w, lb],
      [lb, srv],
    ])
    expect(p.edges[0].config).toEqual({ latencyMs: 300, lossPct: 0 })
    expect(p.settings).toEqual({ seed: 42, speed: 1 })
  })

  it('updates a single node config, an edge config and settings', () => {
    const s = useLabStore.getState()
    const a = s.addNode('server', { x: 0, y: 0 })
    const b = s.addNode('server', { x: 0, y: 0 })
    s.onConnect(conn(a, b))
    s.updateNodeConfig(a, { capacity: 9 })
    s.updateEdgeConfig(`e-${a}-${b}`, { lossPct: 25 })
    s.updateSettings({ speed: 4 })
    const st = useLabStore.getState()
    expect((st.nodes.find((n) => n.id === a)!.data.config as { capacity: number }).capacity).toBe(9)
    expect((st.nodes.find((n) => n.id === b)!.data.config as { capacity: number }).capacity).toBe(5)
    expect(st.edges[0].data?.config).toEqual({ latencyMs: 300, lossPct: 25 })
    expect(st.settings.speed).toBe(4)
  })

  it('removing a node removes its edges', () => {
    const s = useLabStore.getState()
    const w = s.addNode('world', { x: 0, y: 0 })
    const lb = s.addNode('lb', { x: 0, y: 0 })
    s.onConnect(conn(w, lb))
    s.removeNode(lb)
    expect(useLabStore.getState().nodes).toHaveLength(1)
    expect(useLabStore.getState().edges).toHaveLength(0)
  })

  it('loadProject fills defaults for old projects and keeps ids unique', () => {
    const s = useLabStore.getState()
    s.loadProject({
      id: 'p9',
      name: 'loaded',
      settings: { seed: 5 } as never,
      nodes: [
        { id: 'world-1', type: 'world', position: { x: 1, y: 2 }, config: { intensity: 'fast' } as never },
        { id: 'server-7', type: 'server', position: { x: 3, y: 4 }, config: { capacity: 2, processingMs: 100 } as never },
      ],
      edges: [{ id: 'e1', source: 'world-1', target: 'server-7' }],
    })
    const st = useLabStore.getState()
    expect(st.settings).toEqual({ seed: 5, speed: 1 })
    expect(st.nodes[0].data.config).toMatchObject({ rps: 2, pattern: 'steady' })
    expect(st.nodes[1].data.config).toMatchObject({ capacity: 2, processingMs: 100, queueSize: 0 })
    expect(st.edges[0].data?.config).toEqual({ latencyMs: 300, lossPct: 0 })
    expect(st.addNode('server', { x: 0, y: 0 })).toBe('server-8')
  })
})
