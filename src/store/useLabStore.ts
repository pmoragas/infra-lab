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
import type { EdgeConfig, NodeConfig, NodeType, Project, ProjectSettings, SimState } from '../engine/types'
import { DEFAULT_CONFIG, DEFAULT_EDGE, DEFAULT_SETTINGS, LABEL, withDefaults } from '../engine/defaults'

export type LabFlowNode = Node<{ config: NodeConfig }, NodeType>
export type LabFlowEdge = Edge<{ config: EdgeConfig }>

const counters: Record<string, number> = {}
const newId = (type: NodeType) => `${type}-${(counters[type] = (counters[type] ?? 0) + 1)}`

export interface LabStore {
  projectId: string
  name: string
  settings: ProjectSettings
  nodes: LabFlowNode[]
  edges: LabFlowEdge[]
  selectedId: string | null // node id
  selectedEdgeId: string | null
  sim: SimState | null

  addNode(type: NodeType, position: { x: number; y: number }): string
  removeNode(id: string): void
  removeEdge(id: string): void
  updateNodeConfig(id: string, patch: Partial<NodeConfig>): void
  updateEdgeConfig(id: string, patch: Partial<EdgeConfig>): void
  updateSettings(patch: Partial<ProjectSettings>): void
  select(id: string | null): void
  selectEdge(id: string | null): void
  onNodesChange(changes: NodeChange<LabFlowNode>[]): void
  onEdgesChange(changes: EdgeChange<LabFlowEdge>[]): void
  onConnect(conn: Connection): void
  setSim(sim: SimState | null): void
  toProject(): Project
  loadProject(project: Project): void
}

export const useLabStore = create<LabStore>((set, get) => ({
  projectId: 'default',
  name: 'Untitled',
  settings: { ...DEFAULT_SETTINGS },
  nodes: [],
  edges: [],
  selectedId: null,
  selectedEdgeId: null,
  sim: null,

  addNode(type, position) {
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
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
  },

  removeEdge(id) {
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== id),
      selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
    }))
  },

  updateNodeConfig(id, patch) {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { config: { ...n.data.config, ...patch } as NodeConfig } } : n,
      ),
    }))
  },

  updateEdgeConfig(id, patch) {
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === id ? { ...e, data: { config: { ...DEFAULT_EDGE, ...e.data?.config, ...patch } } } : e,
      ),
    }))
  },

  updateSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
  },

  select(id) {
    set({ selectedId: id, selectedEdgeId: id ? null : get().selectedEdgeId })
  },

  selectEdge(id) {
    set({ selectedEdgeId: id, selectedId: id ? null : get().selectedId })
  },

  onNodesChange(changes) {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }))
  },

  onEdgesChange(changes) {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }))
  },

  onConnect(conn) {
    if (!conn.source || !conn.target || conn.source === conn.target) return
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
    }
  },

  loadProject(project) {
    // Keep id counters ahead of any loaded id so new nodes never collide.
    for (const n of project.nodes) {
      const num = Number(n.id.split('-').pop())
      if (Number.isFinite(num) && num > (counters[n.type] ?? 0)) counters[n.type] = num
    }
    set({
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
      selectedId: null,
      selectedEdgeId: null,
      sim: null,
    })
  },
}))
