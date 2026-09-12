import { createRng } from './rng'
import { handlers } from './nodes'
import type {
  LabEdge,
  LabNode,
  NodeConfig,
  NodeContext,
  Packet,
  Project,
  SimState,
  Stats,
} from './types'

export interface EngineOptions {
  /** Sim time advanced per tick, ms. */
  tickMs?: number
  /** Time for a packet to cross one edge, ms. */
  travelMs?: number
  /** Timer used by start(); defaults to setInterval. Tests can omit start() and call step(). */
  setInterval?: typeof globalThis.setInterval
  clearInterval?: typeof globalThis.clearInterval
}

export type Listener = (state: SimState) => void

export interface Engine {
  start(): void
  pause(): void
  reset(): void
  step(dt?: number): void
  subscribe(listener: Listener): () => void
  getState(): SimState
  addNode(node: LabNode): void
  removeNode(id: string): void
  addEdge(edge: LabEdge): void
  removeEdge(id: string): void
  updateNodeConfig(id: string, patch: Partial<NodeConfig>): void
}

export function createEngine(project: Project, opts: EngineOptions = {}): Engine {
  const tickMs = opts.tickMs ?? 50
  const travelMs = opts.travelMs ?? 600
  const setI = opts.setInterval ?? globalThis.setInterval
  const clearI = opts.clearInterval ?? globalThis.clearInterval

  const nodes = new Map<string, LabNode>(project.nodes.map((n) => [n.id, structuredClone(n)]))
  const edges = new Map<string, LabEdge>(project.edges.map((e) => [e.id, { ...e }]))

  let status: SimState['status'] = 'idle'
  let tick = 0
  let now = 0
  let packets: Packet[] = []
  let stats: Stats = { servers: {}, lbs: {} }
  let nodeState = new Map<string, unknown>()
  let rng = createRng(project.settings.seed)
  let idCounter = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const listeners = new Set<Listener>()

  function findEdge(a: string, b: string): LabEdge | undefined {
    for (const e of edges.values()) {
      if ((e.source === a && e.target === b) || (e.source === b && e.target === a)) return e
    }
    return undefined
  }

  const ctx: NodeContext = {
    get now() {
      return now
    },
    random: () => rng(),
    send(from, to, packet) {
      const edge = findEdge(from, to)
      if (!edge) return
      packet.edgeId = edge.id
      packet.from = from
      packet.to = to
      packet.progress = 0
      packets.push(packet)
    },
    targets(nodeId) {
      const out: string[] = []
      for (const e of edges.values()) if (e.source === nodeId) out.push(e.target)
      return out
    },
    state<T>(nodeId: string, init: () => T): T {
      if (!nodeState.has(nodeId)) nodeState.set(nodeId, init())
      return nodeState.get(nodeId) as T
    },
    get stats() {
      return stats
    },
    nextId: () => `p${++idCounter}`,
  }

  function snapshot(): SimState {
    return {
      status,
      tick,
      now,
      packets: packets.map((p) => ({ ...p, path: [...p.path] })),
      stats: structuredClone(stats),
    }
  }

  function emit() {
    const s = snapshot()
    for (const l of listeners) l(s)
  }

  function step(dt = tickMs) {
    tick += 1
    now += dt

    // 1. Move packets; deliver the ones that arrived.
    const arrived: Packet[] = []
    const inFlight: Packet[] = []
    for (const p of packets) {
      p.progress = Math.min(1, p.progress + dt / travelMs)
      if (p.progress >= 1) arrived.push(p)
      else inFlight.push(p)
    }
    packets = inFlight
    for (const p of arrived) {
      const node = nodes.get(p.to)
      if (node) handlers[node.type].onPacket(node, p, ctx)
    }

    // 2. Tick every node.
    for (const node of nodes.values()) handlers[node.type].tick(node, dt, ctx)

    emit()
  }

  function start() {
    if (status === 'running') return
    status = 'running'
    timer = setI(() => step(tickMs), tickMs)
    emit()
  }

  function pause() {
    if (status !== 'running') return
    status = 'paused'
    if (timer !== undefined) clearI(timer)
    timer = undefined
    emit()
  }

  function reset() {
    if (timer !== undefined) clearI(timer)
    timer = undefined
    status = 'idle'
    tick = 0
    now = 0
    packets = []
    stats = { servers: {}, lbs: {} }
    nodeState = new Map()
    rng = createRng(project.settings.seed)
    idCounter = 0
    emit()
  }

  return {
    start,
    pause,
    reset,
    step,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getState: snapshot,
    addNode(node) {
      nodes.set(node.id, structuredClone(node))
    },
    removeNode(id) {
      nodes.delete(id)
      nodeState.delete(id)
      for (const [eid, e] of edges) if (e.source === id || e.target === id) edges.delete(eid)
      packets = packets.filter((p) => p.from !== id && p.to !== id)
      delete stats.servers[id]
      delete stats.lbs[id]
    },
    addEdge(edge) {
      edges.set(edge.id, { ...edge })
    },
    removeEdge(id) {
      edges.delete(id)
      packets = packets.filter((p) => p.edgeId !== id)
    },
    updateNodeConfig(id, patch) {
      const n = nodes.get(id)
      if (n) n.config = { ...n.config, ...patch } as NodeConfig
    },
  }
}
