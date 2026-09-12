import { createRng } from './rng'
import { handlers } from './nodes'
import { DEFAULT_EDGE, DEFAULT_SETTINGS, withDefaults } from './defaults'
import type {
  LabEdge,
  LabNode,
  NodeConfig,
  NodeContext,
  NodeStats,
  NodeType,
  Packet,
  PacketStatus,
  Project,
  SimState,
  Stats,
} from './types'

export interface EngineOptions {
  /** Sim time advanced per tick, ms. */
  tickMs?: number
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
  updateEdgeConfig(id: string, patch: Partial<LabEdge['config']>): void
  setSpeed(speed: number): void
}

export function emptyNodeStats(): NodeStats {
  return {
    in: 0,
    out: 0,
    active: 0,
    queued: 0,
    processed: 0,
    dropped: 0,
    failed: 0,
    rejected: 0,
    hits: 0,
    misses: 0,
    retries: 0,
    timeouts: 0,
    loadPct: 0,
    perTarget: {},
  }
}

function emptyStats(): Stats {
  return { nodes: {}, global: { sent: 0, ok: 0, error: 0, timeout: 0, errors: {} } }
}

export function createEngine(project: Project, opts: EngineOptions = {}): Engine {
  const tickMs = opts.tickMs ?? 50
  const setI = opts.setInterval ?? globalThis.setInterval
  const clearI = opts.clearInterval ?? globalThis.clearInterval
  const settings = { ...DEFAULT_SETTINGS, ...project.settings }

  const nodes = new Map<string, LabNode>()
  const edges = new Map<string, LabEdge>()
  for (const n of project.nodes) nodes.set(n.id, { ...n, config: withDefaults(n.type, n.config as never) })
  for (const e of project.edges) edges.set(e.id, { ...e, config: { ...DEFAULT_EDGE, ...e.config } })

  let status: SimState['status'] = 'idle'
  let tick = 0
  let now = 0
  let packets: Packet[] = []
  let stats: Stats = emptyStats()
  let nodeState = new Map<string, unknown>()
  let startedAt = new Map<string, number>()
  let rng = createRng(settings.seed)
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
    nextId: () => `p${++idCounter}`,
    send(from, to, packet) {
      const edge = findEdge(from, to)
      if (!edge) return
      const loss = edge.config?.lossPct ?? 0
      if (loss > 0 && rng() * 100 < loss) return // lost on the wire
      // A request re-sent from a node it already visited (retry, cache miss → origin) restarts its path there,
      // so the reply walks back through real edges only.
      if (packet.phase === 'request') {
        const i = packet.path.lastIndexOf(from)
        if (i >= 0) packet.path.length = i + 1
      }
      packet.edgeId = edge.id
      packet.from = from
      packet.to = to
      packet.progress = 0
      packets.push(packet)
    },
    respond(nodeId, packet, statusIn, error) {
      packet.phase = 'response'
      if (statusIn) packet.status = statusIn
      if (error) packet.error = error
      const idx = packet.path.lastIndexOf(nodeId)
      const back = packet.path[idx - 1]
      if (back) ctx.send(nodeId, back, packet)
    },
    targets(nodeId) {
      const out: string[] = []
      for (const e of edges.values()) if (e.source === nodeId) out.push(e.target)
      return out
    },
    sources(nodeId) {
      const out: string[] = []
      for (const e of edges.values()) if (e.target === nodeId) out.push(e.source)
      return out
    },
    nodeType: (id) => nodes.get(id)?.type,
    nodeConfig: (id) => nodes.get(id)?.config,
    isDown(id) {
      const c = nodes.get(id)?.config as { down?: boolean } | undefined
      return c?.down === true
    },
    state<T>(nodeId: string, init: () => T): T {
      if (!nodeState.has(nodeId)) nodeState.set(nodeId, init())
      return nodeState.get(nodeId) as T
    },
    stats(nodeId) {
      return (stats.nodes[nodeId] ??= emptyNodeStats())
    },
    get global() {
      return stats.global
    },
    complete(_packet, outcome) {
      const g = stats.global
      if (outcome === 'ok') g.ok += 1
      else if (outcome === 'timeout') g.timeout += 1
      else {
        g.error += 1
        g.errors[outcome] = (g.errors[outcome] ?? 0) + 1
      }
    },
    startedAt: (id) => startedAt.get(id) ?? 0,
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

  function step(dt = tickMs * settings.speed) {
    tick += 1
    now += dt

    // 1. Move packets; deliver the ones that arrived.
    const arrived: Packet[] = []
    const inFlight: Packet[] = []
    for (const p of packets) {
      const travel = edges.get(p.edgeId)?.config?.latencyMs ?? DEFAULT_EDGE.latencyMs
      p.progress = Math.min(1, p.progress + dt / Math.max(1, travel))
      if (p.progress >= 1) arrived.push(p)
      else inFlight.push(p)
    }
    packets = inFlight
    for (const p of arrived) {
      const node = nodes.get(p.to)
      if (!node) continue
      ctx.stats(node.id).in += 1
      handlers[node.type].onPacket(node, p, ctx)
    }

    // 2. Tick every node.
    for (const node of nodes.values()) handlers[node.type].tick(node, dt, ctx)

    emit()
  }

  function start() {
    if (status === 'running') return
    status = 'running'
    for (const id of nodes.keys()) if (!startedAt.has(id)) startedAt.set(id, now)
    timer = setI(() => step(), tickMs)
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
    stats = emptyStats()
    nodeState = new Map()
    startedAt = new Map()
    rng = createRng(settings.seed)
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
      nodes.set(node.id, { ...node, config: withDefaults(node.type, node.config as never) })
      startedAt.set(node.id, now)
    },
    removeNode(id) {
      nodes.delete(id)
      nodeState.delete(id)
      startedAt.delete(id)
      for (const [eid, e] of edges) if (e.source === id || e.target === id) edges.delete(eid)
      packets = packets.filter((p) => p.from !== id && p.to !== id)
      delete stats.nodes[id]
    },
    addEdge(edge) {
      edges.set(edge.id, { ...edge, config: { ...DEFAULT_EDGE, ...edge.config } })
    },
    removeEdge(id) {
      edges.delete(id)
      packets = packets.filter((p) => p.edgeId !== id)
    },
    updateNodeConfig(id, patch) {
      const n = nodes.get(id)
      if (n) n.config = { ...n.config, ...patch } as NodeConfig
    },
    updateEdgeConfig(id, patch) {
      const e = edges.get(id)
      if (e) e.config = { ...DEFAULT_EDGE, ...e.config, ...patch }
    },
    setSpeed(speed) {
      settings.speed = speed
    },
  }
}

export type { NodeType, PacketStatus }
