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
import type { NodeConfig, NodeType, Project, SimState } from '../engine/types'

export type LabFlowNode = Node<{ config: NodeConfig }, NodeType>

export const DEFAULT_CONFIG: Record<NodeType, NodeConfig> = {
  world: { intensity: 'normal' },
  lb: { algorithm: 'roundRobin' },
  server: { capacity: 5, processingMs: 300 },
}

const LABEL: Record<NodeType, string> = { world: 'World', lb: 'Load Balancer', server: 'Server' }

const counters: Record<NodeType, number> = { world: 0, lb: 0, server: 0 }
const newId = (type: NodeType) => `${type}-${++counters[type]}`

export interface LabStore {
  projectId: string
  name: string
  seed: number
  nodes: LabFlowNode[]
  edges: Edge[]
  selectedId: string | null
  sim: SimState | null

  addNode(type: NodeType, position: { x: number; y: number }): string
  removeNode(id: string): void
  updateNodeConfig(id: string, patch: Partial<NodeConfig>): void
  select(id: string | null): void
  onNodesChange(changes: NodeChange<LabFlowNode>[]): void
  onEdgesChange(changes: EdgeChange[]): void
  onConnect(conn: Connection): void
  setSim(sim: SimState | null): void
  toProject(): Project
  loadProject(project: Project): void
}

export const useLabStore = create<LabStore>((set, get) => ({
  projectId: 'default',
  name: 'Untitled',
  seed: 42,
  nodes: [],
  edges: [],
  selectedId: null,
  sim: null,

  addNode(type, position) {
    const id = newId(type)
    const node: LabFlowNode = {
      id,
      type,
      position,
      data: { config: { ...DEFAULT_CONFIG[type] } },
      // label is derived, kept in data-free form for React Flow
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

  updateNodeConfig(id, patch) {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { config: { ...n.data.config, ...patch } as NodeConfig } } : n,
      ),
    }))
  },

  select(id) {
    set({ selectedId: id })
  },

  onNodesChange(changes) {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }))
  },

  onEdgesChange(changes) {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }))
  },

  onConnect(conn) {
    if (!conn.source || !conn.target || conn.source === conn.target) return
    set((s) => ({ edges: addEdge({ ...conn, id: `e-${conn.source}-${conn.target}` }, s.edges) }))
  },

  setSim(sim) {
    set({ sim })
  },

  loadProject(project) {
    // Keep id counters ahead of any loaded id so new nodes never collide.
    for (const n of project.nodes) {
      const num = Number(n.id.split('-').pop())
      if (Number.isFinite(num) && num > counters[n.type]) counters[n.type] = num
    }
    set({
      projectId: project.id,
      name: project.name,
      seed: project.settings.seed,
      nodes: project.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { config: { ...n.config } },
        ariaLabel: LABEL[n.type],
      })),
      edges: project.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      selectedId: null,
      sim: null,
    })
  },

  toProject() {
    const s = get()
    return {
      id: s.projectId,
      name: s.name,
      settings: { seed: s.seed },
      nodes: s.nodes.map((n) => ({ id: n.id, type: n.type!, position: n.position, config: n.data.config })),
      edges: s.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }
  },
}))
