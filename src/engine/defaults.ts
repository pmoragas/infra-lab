import type { ConfigByType, EdgeConfig, NodeType, ProjectSettings } from './types'

export const DEFAULT_CONFIG: { [K in NodeType]: ConfigByType[K] } = {
  world: { name: 'World', rps: 2, pattern: 'steady', burstEvery: 2000, burstSize: 10, clients: 5, keyspace: 20, timeoutMs: 15000 },
  lb: { algorithm: 'roundRobin', weights: {}, timeoutMs: 5000, retries: 1, healthCheck: true },
  server: { capacity: 5, processingMs: 300, queueSize: 0, failureRate: 0, jitterMs: 0, warmupMs: 0, cacheTimeoutMs: 1000, backendTimeoutMs: 5000, down: false },
  cache: { maxEntries: 10, ttlMs: 5000, latencyMs: 20 },
  cdn: { maxEntries: 50, ttlMs: 10000, latencyMs: 10 },
  rateLimiter: { algorithm: 'tokenBucket', ratePerSec: 5, burst: 5, perClient: false },
  apiGateway: { latencyMs: 20, authFailRate: 0 },
  database: { capacity: 2, latencyMs: 200, replicas: 0, readRatio: 0.8, down: false },
  queue: { maxSize: 100 },
  consumer: { capacity: 1, processingMs: 500, failureRate: 0, maxRetries: 2 },
  dns: { latencyMs: 100, ttlMs: 10000 },
  circuitBreaker: { failureThreshold: 3, windowMs: 5000, openMs: 3000 },
  thirdParty: { latencyMs: 400, jitterMs: 200, failureRate: 0.1, down: false },
}

export const DEFAULT_EDGE: EdgeConfig = { latencyMs: 300, lossPct: 0 }

export const DEFAULT_SETTINGS: ProjectSettings = { seed: 42, speed: 1 }

export const LABEL: Record<NodeType, string> = {
  world: 'World / Client',
  lb: 'Load Balancer',
  server: 'Server',
  cache: 'Cache',
  cdn: 'CDN',
  rateLimiter: 'Rate Limiter',
  apiGateway: 'API Gateway',
  database: 'Database',
  queue: 'Message Queue',
  consumer: 'Consumer',
  dns: 'DNS',
  circuitBreaker: 'Circuit Breaker',
  thirdParty: 'Third-party API',
}

/** v1 projects stored fewer fields; fill in anything missing. */
export function withDefaults<K extends NodeType>(type: K, config: Partial<ConfigByType[K]> | undefined): ConfigByType[K] {
  return { ...DEFAULT_CONFIG[type], ...(config ?? {}) } as ConfigByType[K]
}
