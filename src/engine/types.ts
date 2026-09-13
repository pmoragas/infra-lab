// Data model — see Infra Lab plan (D — Data model)

export type NodeType =
  | 'world'
  | 'lb'
  | 'server'
  | 'cache'
  | 'cdn'
  | 'rateLimiter'
  | 'apiGateway'
  | 'database'
  | 'queue'
  | 'consumer'
  | 'dns'
  | 'circuitBreaker'
  | 'thirdParty'

export type Algorithm = 'roundRobin' | 'random' | 'leastConnections' | 'weightedRoundRobin' | 'ipHash'
export type RateAlgorithm = 'tokenBucket' | 'fixedWindow' | 'slidingWindow'
export type TrafficPattern = 'steady' | 'burst'

export interface WorldConfig {
  name: string
  rps: number
  pattern: TrafficPattern
  burstEvery: number // ms, burst pattern only
  burstSize: number // packets per burst
  clients: number // distinct client ids (for ipHash, rate limits, dns)
  keyspace: number // distinct request keys (for caches)
  timeoutMs: number // give up waiting for a response
}

export interface LbConfig {
  algorithm: Algorithm
  weights: Record<string, number> // server id → weight (weightedRoundRobin)
  timeoutMs: number
  retries: number
  healthCheck: boolean // skip servers marked down
}

export interface ServerConfig {
  capacity: number
  processingMs: number
  queueSize: number
  failureRate: number // 0..1
  jitterMs: number
  warmupMs: number // processing doubled during warm-up after (re)start
  down: boolean
}

export interface CacheConfig {
  maxEntries: number
  ttlMs: number
  latencyMs: number
}

export interface RateLimiterConfig {
  algorithm: RateAlgorithm
  ratePerSec: number
  burst: number // bucket size / window allowance
  perClient: boolean
}

export interface ApiGatewayConfig {
  latencyMs: number
  authFailRate: number // 0..1
}

export interface DatabaseConfig {
  capacity: number // concurrent queries on the primary
  latencyMs: number
  replicas: number // read replicas, each adds `capacity` for reads
  readRatio: number // 0..1 share of requests that are reads
  down: boolean
}

export interface QueueConfig {
  maxSize: number
}

export interface ConsumerConfig {
  capacity: number
  processingMs: number
  failureRate: number
  maxRetries: number
}

export interface DnsConfig {
  latencyMs: number
  ttlMs: number
}

export interface CircuitBreakerConfig {
  failureThreshold: number // failures within windowMs to open
  windowMs: number
  openMs: number // stay open this long, then half-open
}

export interface ThirdPartyConfig {
  latencyMs: number
  jitterMs: number
  failureRate: number
  down: boolean
}

export interface ConfigByType {
  world: WorldConfig
  lb: LbConfig
  server: ServerConfig
  cache: CacheConfig
  cdn: CacheConfig
  rateLimiter: RateLimiterConfig
  apiGateway: ApiGatewayConfig
  database: DatabaseConfig
  queue: QueueConfig
  consumer: ConsumerConfig
  dns: DnsConfig
  circuitBreaker: CircuitBreakerConfig
  thirdParty: ThirdPartyConfig
}

export type NodeConfig = ConfigByType[NodeType]

export interface LabNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  config: NodeConfig
}

export interface EdgeConfig {
  latencyMs: number // time for a packet to cross this link
  lossPct: number // 0..100
  down?: boolean // link cut: everything on it is lost
}

export interface LabEdge {
  id: string
  source: string
  target: string
  config?: EdgeConfig
}

export interface ProjectSettings {
  seed: number
  speed: number // sim-time multiplier: 0.25 … 4
}

export type FailureKind = 'kill' | 'partition' | 'spike' | 'flush'

/** Scheduled failure on `target` (node id, or edge id for 'partition') from atMs for durationMs of sim time. */
export interface Failure {
  id: string
  kind: FailureKind
  target: string
  atMs: number
  durationMs: number // ignored by 'flush', which is instant
  factor: number // 'spike' only: traffic multiplier
}

/** A lesson attached to a preset: the question to answer and what to do, in order. */
export interface Guide {
  question: string
  steps: string[]
}

/** Results for one stretch of sim time: a fast run's window, or a whole run from 0. */
export interface RunWindow {
  fromMs: number
  simMs: number // end of the window
  completed: number
  successPct: number
  failed: number
  p50: number
  p95: number
  p99: number
}

/** Results pinned from a run, to compare against other runs. */
export interface ResultSnapshot extends RunWindow {
  id: string
  label: string
}

export interface Project {
  id: string
  name: string
  nodes: LabNode[]
  edges: LabEdge[]
  settings: ProjectSettings
  failures?: Failure[]
  guide?: Guide
  snapshots?: ResultSnapshot[]
}

// Runtime only

export type SimStatus = 'idle' | 'running' | 'paused'
export type Phase = 'request' | 'response'
export type PacketStatus = 'ok' | 'error'

export interface Packet {
  id: string
  clientId: string
  key: number
  edgeId: string
  from: string
  to: string
  progress: number // 0..1 along from → to
  phase: Phase
  status: PacketStatus
  error?: string // reason when status = 'error'
  createdAt: number
  /** Nodes visited on the request leg; the response walks it backwards. */
  path: string[]
}

/** Generic per-node counters. Handlers fill in what applies to them. */
export interface NodeStats {
  in: number
  out: number
  active: number
  queued: number
  processed: number
  dropped: number
  failed: number
  rejected: number
  hits: number
  misses: number
  retries: number
  timeouts: number
  loadPct: number
  perTarget: Record<string, number>
  state?: string // e.g. circuit breaker: closed / open / half-open
}

export interface LatencySummary {
  count: number // successful requests measured
  p50: number
  p95: number
  p99: number
}

export interface GlobalStats {
  sent: number
  ok: number
  error: number
  timeout: number
  errors: Record<string, number> // reason → count
  latency: LatencySummary // successful requests over the whole run
}

export interface Stats {
  nodes: Record<string, NodeStats>
  global: GlobalStats
}

export interface Hop {
  node: string
  at: number
  phase: Phase
  lost?: boolean // never arrived: link loss or cut
}

export interface Journey {
  id: string
  clientId: string
  key: number
  startedAt: number
  endedAt?: number
  outcome?: string // 'ok', 'timeout' or an error reason
  hops: Hop[]
}

export interface ChaosState {
  down: string[] // nodes down right now (toggled or scheduled)
  cut: string[] // links cut right now
  spikes: Record<string, number> // world id → active traffic multiplier
}

export interface SimState {
  status: SimStatus
  tick: number
  now: number // sim time in ms
  packets: Packet[]
  stats: Stats
  journeys: Journey[] // recently completed, oldest first
  chaos: ChaosState
}

// Node handler contract — see plan (I — Interface)

export interface NodeContext {
  now: number
  random(): number
  nextId(): string
  /** Send a packet along the edge between two directly connected nodes. Lost if no edge or link loss. */
  send(from: string, to: string, packet: Packet): void
  /** Turn a request into a response (or pass a response on) and send it one hop back along its path. */
  respond(nodeId: string, packet: Packet, status?: PacketStatus, error?: string): void
  targets(nodeId: string): string[]
  sources(nodeId: string): string[]
  nodeType(nodeId: string): NodeType | undefined
  nodeConfig(nodeId: string): NodeConfig | undefined
  isDown(nodeId: string): boolean
  /** Per-node mutable runtime state (created lazily). */
  state<T>(nodeId: string, init: () => T): T
  stats(nodeId: string): NodeStats
  global: GlobalStats
  /** Record the final outcome of a packet (called by its origin): 'ok', 'timeout' or an error reason. */
  complete(packet: Packet, outcome: string): void
  /** Sim time when the run started or this node was (re)added. */
  startedAt(nodeId: string): number
}

export interface NodeHandler {
  onPacket(node: LabNode, packet: Packet, ctx: NodeContext): void
  tick(node: LabNode, dt: number, ctx: NodeContext): void
}
