import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react'
import type { EdgeConfig, Failure, Guide, NodeConfig, NodeType, Project, ProjectSettings, ResultSnapshot, RunWindow, SimState } from '../engine/types'
import { DEFAULT_CONFIG, DEFAULT_EDGE, DEFAULT_SETTINGS, LABEL, withDefaults } from '../engine/defaults'

export type LabFlowNode = Node<{ config: NodeConfig }, NodeType>
export type LabFlowEdge = Edge<{ config: EdgeConfig }>
export type Panel = 'packets' | 'chaos'

/** The undoable part of a project. */
interface Snapshot {
  name: string
  settings: ProjectSettings
  nodes: LabFlowNode[]
  edges: LabFlowEdge[]
  failures: Failure[]
}

const counters: Record<string, number> = {}
const newId = (type: NodeType) => `${type}-${(counters[type] = (counters[type] ?? 0) + 1)}`

const HISTORY_LIMIT = 100
const COALESCE_MS = 1000
const SNAPSHOT_LIMIT = 3

export interface LabStore {
  projectId: string
  name: string
  settings: ProjectSettings
  nodes: LabFlowNode[]
  edges: LabFlowEdge[]
  failures: Failure[]
  guide: Guide | null // lesson text for presets; not undoable
  snapshots: ResultSnapshot[] // pinned run results, oldest first
  selectedId: string | null // node id
  selectedEdgeId: string | null
  sim: SimState | null
  past: Snapshot[]
  future: Snapshot[]
  /** Bumped whenever a project is loaded, so the canvas can fit it into view. */
  fitRequest: number
  panel: Panel | null
  journeyId: string | null

  addNode(type: NodeType, position: { x: number; y: number }): string
  removeNode(id: string): void
  removeEdge(id: string): void
  updateNodeConfig(id: string, patch: Partial<NodeConfig>): void
  updateEdgeConfig(id: string, patch: Partial<EdgeConfig>): void
  updateSettings(patch: Partial<ProjectSettings>): void
  setName(name: string): void
  addFailure(failure: Omit<Failure, 'id'>): string
  updateFailure(id: string, patch: Partial<Omit<Failure, 'id'>>): void
  removeFailure(id: string): void
  /** Pin the whole current run's results; null when nothing has completed yet. */
  addSnapshot(): string | null
  /** Pin the results of one fast-run window. */
  addWindowSnapshot(window: RunWindow): string
  renameSnapshot(id: string, label: string): void
  removeSnapshot(id: string): void
  undo(): void
  redo(): void
  select(id: string | null): void
  selectEdge(id: string | null): void
  openPanel(panel: Panel | null): void
  openJourney(id: string | null): void
  onNodesChange(changes: NodeChange<LabFlowNode>[]): void
  onEdgesChange(changes: EdgeChange<LabFlowEdge>[]): void
  onConnect(conn: Connection): void
  setSim(sim: SimState | null): void
  toProject(): Project
  loadProject(project: Project): void
}

export const useLabStore = create<LabStore>((set, get) => {
  let lastKey: string | null = null
  let lastAt = 0
  let dragging = false
  let removing = false

  const snap = (): Snapshot => {
    const s = get()
    return { name: s.name, settings: s.settings, nodes: s.nodes, edges: s.edges, failures: s.failures }
  }

  /** Save an undo point before a change. Same-key changes in quick succession (typing in a field) share one point. */
  const record = (key?: string) => {
    const now = Date.now()
    const same = key !== undefined && key === lastKey && now - lastAt < COALESCE_MS
    lastKey = key ?? null
    lastAt = now
    if (same) return
    set((s) => ({ past: [...s.past, snap()].slice(-HISTORY_LIMIT), future: [] }))
  }

  /** React Flow deletes nodes and their edges in two calls from one key press: keep them one undo step. */
  const recordRemoval = () => {
    if (removing) return
    record()
    removing = true
    queueMicrotask(() => {
      removing = false
    })
  }

  const restore = (to: Snapshot, past: Snapshot[], future: Snapshot[]) => {
    lastKey = null
    set((s) => ({
      ...to,
      past,
      future,
      selectedId: to.nodes.some((n) => n.id === s.selectedId) ? s.selectedId : null,
      selectedEdgeId: to.edges.some((e) => e.id === s.selectedEdgeId) ? s.selectedEdgeId : null,
    }))
  }

  const keys = (patch: object) => Object.keys(patch).sort().join(',')

  const pushSnapshot = (data: RunWindow) => {
    const s = get()
    const numbers = s.snapshots.map((x) => Number(/^Run (\d+)$/.exec(x.label)?.[1] ?? 0))
    const snapshot: ResultSnapshot = { ...data, id: `r-${crypto.randomUUID().slice(0, 6)}`, label: `Run ${Math.max(s.snapshots.length, ...numbers) + 1}` }
    set({ snapshots: [...s.snapshots, snapshot].slice(-SNAPSHOT_LIMIT) })
    return snapshot.id
  }

  return {
    projectId: 'default',
    name: 'Untitled',
    settings: { ...DEFAULT_SETTINGS },
    nodes: [],
    edges: [],
    failures: [],
    guide: null,
    snapshots: [],
    selectedId: null,
    selectedEdgeId: null,
    sim: null,
    past: [],
    future: [],
    fitRequest: 0,
    panel: null,
    journeyId: null,

    addNode(type, position) {
      record()
      const id = newId(type)
      const node: LabFlowNode = {
        id,
        type,
        position,
        data: { config: structuredClone(DEFAULT_CONFIG[type]) as NodeConfig },
        ariaLabel: LABEL[type],
      }
      set((s) => ({ nodes: [...s.nodes, node] }))
      return id
    },

    removeNode(id) {
      record()
      set((s) => {
        const gone = new Set([id, ...s.edges.filter((e) => e.source === id || e.target === id).map((e) => e.id)])
        return {
          nodes: s.nodes.filter((n) => n.id !== id),
          edges: s.edges.filter((e) => !gone.has(e.id)),
          failures: s.failures.filter((f) => !gone.has(f.target)),
          selectedId: s.selectedId === id ? null : s.selectedId,
        }
      })
    },

    removeEdge(id) {
      record()
      set((s) => ({
        edges: s.edges.filter((e) => e.id !== id),
        failures: s.failures.filter((f) => f.target !== id),
        selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
      }))
    },

    updateNodeConfig(id, patch) {
      record(`node:${id}:${keys(patch)}`)
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === id ? { ...n, data: { config: { ...n.data.config, ...patch } as NodeConfig } } : n,
        ),
      }))
    },

    updateEdgeConfig(id, patch) {
      record(`edge:${id}:${keys(patch)}`)
      set((s) => ({
        edges: s.edges.map((e) =>
          e.id === id ? { ...e, data: { config: { ...DEFAULT_EDGE, ...e.data?.config, ...patch } } } : e,
        ),
      }))
    },

    updateSettings(patch) {
      record(`settings:${keys(patch)}`)
      set((s) => ({ settings: { ...s.settings, ...patch } }))
    },

    setName(name) {
      record('name')
      set({ name })
    },

    addFailure(failure) {
      record()
      const id = `f-${crypto.randomUUID().slice(0, 6)}`
      set((s) => ({ failures: [...s.failures, { ...failure, id }] }))
      return id
    },

    updateFailure(id, patch) {
      record(`failure:${id}:${keys(patch)}`)
      set((s) => ({ failures: s.failures.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
    },

    removeFailure(id) {
      record()
      set((s) => ({ failures: s.failures.filter((f) => f.id !== id) }))
    },

    addSnapshot() {
      const s = get()
      const g = s.sim?.stats.global
      const completed = g ? g.ok + g.error + g.timeout : 0
      if (!s.sim || !g || completed === 0) return null
      return pushSnapshot({
        fromMs: 0,
        simMs: s.sim.now,
        completed,
        successPct: Math.round((g.ok / completed) * 100),
        failed: g.error + g.timeout,
        p50: g.latency.p50,
        p95: g.latency.p95,
        p99: g.latency.p99,
        events: s.sim.events,
      })
    },

    addWindowSnapshot(window) {
      return pushSnapshot(window)
    },

    renameSnapshot(id, label) {
      set((s) => ({ snapshots: s.snapshots.map((x) => (x.id === id ? { ...x, label } : x)) }))
    },

    removeSnapshot(id) {
      set((s) => ({ snapshots: s.snapshots.filter((x) => x.id !== id) }))
    },

    undo() {
      const s = get()
      const prev = s.past.at(-1)
      if (!prev) return
      restore(prev, s.past.slice(0, -1), [snap(), ...s.future].slice(0, HISTORY_LIMIT))
    },

    redo() {
      const s = get()
      const next = s.future[0]
      if (!next) return
      restore(next, [...s.past, snap()].slice(-HISTORY_LIMIT), s.future.slice(1))
    },

    select(id) {
      set({ selectedId: id, selectedEdgeId: id ? null : get().selectedEdgeId })
    },

    selectEdge(id) {
      set({ selectedEdgeId: id, selectedId: id ? null : get().selectedId })
    },

    openPanel(panel) {
      set({ panel })
    },

    openJourney(id) {
      set({ journeyId: id, panel: id ? 'packets' : get().panel })
    },

    onNodesChange(changes) {
      const removed = new Set(changes.flatMap((c) => (c.type === 'remove' ? [c.id] : [])))
      if (removed.size > 0) recordRemoval()
      for (const c of changes) {
        if (c.type !== 'position') continue
        if (c.dragging && !dragging) {
          record()
          dragging = true
        } else if (c.dragging === false) {
          dragging = false
        }
      }
      set((s) => ({
        nodes: applyNodeChanges(changes, s.nodes),
        failures: removed.size > 0 ? s.failures.filter((f) => !removed.has(f.target)) : s.failures,
      }))
    },

    onEdgesChange(changes) {
      const removed = new Set(changes.flatMap((c) => (c.type === 'remove' ? [c.id] : [])))
      if (removed.size > 0) recordRemoval()
      set((s) => ({
        edges: applyEdgeChanges(changes, s.edges),
        failures: removed.size > 0 ? s.failures.filter((f) => !removed.has(f.target)) : s.failures,
      }))
    },

    onConnect(conn) {
      if (!conn.source || !conn.target || conn.source === conn.target) return
      record()
      set((s) => ({
        edges: addEdge(
          { ...conn, id: `e-${conn.source}-${conn.target}`, data: { config: { ...DEFAULT_EDGE } } },
          s.edges,
        ),
      }))
    },

    setSim(sim) {
      set({ sim })
    },

    toProject() {
      const s = get()
      return {
        id: s.projectId,
        name: s.name,
        settings: { ...s.settings },
        nodes: s.nodes.map((n) => ({ id: n.id, type: n.type!, position: n.position, config: n.data.config })),
        edges: s.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, config: e.data?.config })),
        failures: s.failures,
        ...(s.guide ? { guide: s.guide } : {}),
        ...(s.snapshots.length > 0 ? { snapshots: s.snapshots } : {}),
      }
    },

    loadProject(project) {
      // Keep id counters ahead of any loaded id so new nodes never collide.
      for (const n of project.nodes) {
        const num = Number(n.id.split('-').pop())
        if (Number.isFinite(num) && num > (counters[n.type] ?? 0)) counters[n.type] = num
      }
      lastKey = null
      set((s) => ({
        projectId: project.id,
        name: project.name,
        settings: { ...DEFAULT_SETTINGS, ...project.settings },
        nodes: project.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: { config: withDefaults(n.type, n.config as never) as NodeConfig },
          ariaLabel: LABEL[n.type],
        })),
        edges: project.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          data: { config: { ...DEFAULT_EDGE, ...e.config } },
        })),
        failures: project.failures ?? [],
        guide: project.guide ?? null,
        snapshots: project.snapshots ?? [],
        selectedId: null,
        selectedEdgeId: null,
        sim: null,
        past: [],
        future: [],
        fitRequest: s.fitRequest + 1,
        journeyId: null,
      }))
    },
  }
})
