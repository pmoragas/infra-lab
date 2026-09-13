import { describe, it, expect, beforeEach } from 'vitest'
import { useLabStore } from './useLabStore'
import type { SimState } from '../engine/types'

beforeEach(() => {
  useLabStore.setState({ nodes: [], edges: [], failures: [], snapshots: [], selectedId: null, selectedEdgeId: null, sim: null, past: [], future: [] })
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

const capacity = (id: string) => (useLabStore.getState().nodes.find((n) => n.id === id)!.data.config as { capacity: number }).capacity

describe('undo / redo', () => {
  it('undoes and redoes graph changes in order', () => {
    const s = useLabStore.getState()
    const a = s.addNode('server', { x: 0, y: 0 })
    const b = s.addNode('server', { x: 0, y: 0 })
    s.onConnect(conn(a, b))
    s.undo()
    expect(useLabStore.getState().edges).toHaveLength(0)
    s.undo()
    expect(useLabStore.getState().nodes.map((n) => n.id)).toEqual([a])
    s.redo()
    s.redo()
    expect(useLabStore.getState().nodes).toHaveLength(2)
    expect(useLabStore.getState().edges).toHaveLength(1)
    expect(useLabStore.getState().future).toHaveLength(0)
  })

  it('typing into one field is a single undo step', () => {
    const s = useLabStore.getState()
    const a = s.addNode('server', { x: 0, y: 0 })
    s.updateNodeConfig(a, { capacity: 1 })
    s.updateNodeConfig(a, { capacity: 12 })
    s.updateNodeConfig(a, { capacity: 123 })
    s.undo()
    expect(capacity(a)).toBe(5)
  })

  it('a new change clears the redo stack', () => {
    const s = useLabStore.getState()
    s.addNode('server', { x: 0, y: 0 })
    s.undo()
    expect(useLabStore.getState().future).toHaveLength(1)
    s.addNode('lb', { x: 0, y: 0 })
    expect(useLabStore.getState().future).toHaveLength(0)
  })

  it('removing a node drops failures aimed at it, and undo brings both back', () => {
    const s = useLabStore.getState()
    const a = s.addNode('server', { x: 0, y: 0 })
    s.addFailure({ kind: 'kill', target: a, atMs: 1000, durationMs: 2000, factor: 1 })
    s.removeNode(a)
    expect(useLabStore.getState().failures).toHaveLength(0)
    s.undo()
    expect(useLabStore.getState().nodes).toHaveLength(1)
    expect(useLabStore.getState().failures).toHaveLength(1)
  })

  it('loading a project clears history and includes its failures', () => {
    const s = useLabStore.getState()
    s.addNode('server', { x: 0, y: 0 })
    s.loadProject({
      id: 'p1',
      name: 'x',
      settings: { seed: 1, speed: 1 },
      nodes: [],
      edges: [],
      failures: [{ id: 'f1', kind: 'spike', target: 'world-1', atMs: 0, durationMs: 1000, factor: 3 }],
    })
    const st = useLabStore.getState()
    expect(st.past).toHaveLength(0)
    expect(st.toProject().failures).toHaveLength(1)
  })

  it('pins up to 3 labelled results, drops the oldest, and saves them with the project', () => {
    const sim = (ok: number, error: number, p95: number) =>
      ({
        status: 'paused',
        tick: 1,
        now: 60_000,
        packets: [],
        journeys: [],
        chaos: { down: [], cut: [], spikes: {} },
        events: [],
        stats: { nodes: {}, global: { sent: ok + error, ok, error, timeout: 0, errors: {}, latency: { count: ok, p50: 100, p95, p99: p95 } } },
      }) as SimState
    const s = useLabStore.getState()
    expect(s.addSnapshot()).toBeNull()
    s.setSim(sim(90, 10, 500))
    s.addSnapshot()
    s.setSim(sim(100, 0, 200))
    s.addSnapshot()
    expect(useLabStore.getState().snapshots.map((x) => [x.label, x.fromMs, x.successPct, x.failed, x.p95])).toEqual([
      ['Run 1', 0, 90, 10, 500],
      ['Run 2', 0, 100, 0, 200],
    ])
    expect(useLabStore.getState().toProject().snapshots).toHaveLength(2)
    s.addSnapshot()
    s.addSnapshot()
    expect(useLabStore.getState().snapshots.map((x) => x.label)).toEqual(['Run 2', 'Run 3', 'Run 4'])
  })

  it('pins a fast-run window as it is, numbered after the runs already there', () => {
    const s = useLabStore.getState()
    const window = { fromMs: 60_000, simMs: 120_000, completed: 600, successPct: 99, failed: 4, p50: 250, p95: 250, p99: 250 }
    s.addWindowSnapshot({ ...window, fromMs: 0, simMs: 60_000 })
    s.addWindowSnapshot(window)
    const last = useLabStore.getState().snapshots.at(-1)!
    expect(last).toMatchObject({ ...window, label: 'Run 2' })
  })

  it('a preset’s guide survives load → save, and projects without one stay without', () => {
    const s = useLabStore.getState()
    const guide = { question: 'Does the LB notice?', steps: ['Run', 'Compare'] }
    s.loadProject({ id: 'p2', name: 'lesson', settings: { seed: 1, speed: 1 }, nodes: [], edges: [], guide })
    expect(useLabStore.getState().toProject().guide).toEqual(guide)
    s.loadProject({ id: 'p3', name: 'plain', settings: { seed: 1, speed: 1 }, nodes: [], edges: [] })
    expect('guide' in useLabStore.getState().toProject()).toBe(false)
  })
})
