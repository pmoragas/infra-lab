// Data model — see Infra Lab plan (D — Data model)

export type NodeType = 'world' | 'lb' | 'server'

export type Intensity = 'slow' | 'normal' | 'fast' | 'burst'
export type Algorithm = 'roundRobin' | 'random' | 'leastConnections'

export interface WorldConfig {
  intensity: Intensity
}

export interface LbConfig {
  algorithm: Algorithm
}

export interface ServerConfig {
  capacity: number
  processingMs: number
}

export type NodeConfig = WorldConfig | LbConfig | ServerConfig

export interface LabNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  config: NodeConfig
}

export interface LabEdge {
  id: string
  source: string
  target: string
}

export interface Project {
  id: string
  name: string
  nodes: LabNode[]
  edges: LabEdge[]
  settings: { seed: number }
}

// Runtime only

export type SimStatus = 'idle' | 'running' | 'paused'

export type Phase = 'request' | 'response'

export interface Packet {
  id: string
  edgeId: string
  from: string // node id the packet is travelling from
  to: string // node id the packet is travelling to
  progress: number // 0..1 along from → to
  phase: Phase
  createdAt: number
  /** Nodes visited on the request leg; the response walks it backwards. */
  path: string[]
}

export interface ServerStats {
  active: number
  processed: number
  dropped: number
  loadPct: number
}

export interface LbStats {
  routed: number
  perServer: Record<string, number>
}

export interface Stats {
  servers: Record<string, ServerStats>
  lbs: Record<string, LbStats>
}

export interface SimState {
  status: SimStatus
  tick: number
  now: number // sim time in ms
  packets: Packet[]
  stats: Stats
}

// Node handler contract — see plan (I — Interface)

export interface NodeContext {
  now: number
  random(): number
  /** Send a packet from this node to a directly connected node. Dropped if no edge. */
  send(from: string, to: string, packet: Packet): void
  /** Ids of nodes reachable by an outgoing edge from `nodeId`. */
  targets(nodeId: string): string[]
  /** Per-node mutable runtime state (created lazily). */
  state<T>(nodeId: string, init: () => T): T
  stats: Stats
  nextId(): string
}

export interface NodeHandler {
  onPacket(node: LabNode, packet: Packet, ctx: NodeContext): void
  tick(node: LabNode, dt: number, ctx: NodeContext): void
}
