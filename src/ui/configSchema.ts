import type { EdgeConfig, NodeConfig, NodeType } from '../engine/types'

export type Field =
  | { key: string; label: string; type: 'number'; min?: number; max?: number; step?: number; hint?: string }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; hint?: string }
  | { key: string; label: string; type: 'boolean'; hint?: string }
  | { key: string; label: string; type: 'text'; hint?: string }
  | { key: string; label: string; type: 'weights'; hint?: string } // LB: one number per target

const pct = { min: 0, max: 1, step: 0.05 }

export const NODE_FIELDS: Record<NodeType, Field[]> = {
  world: [
    { key: 'name', label: 'Name', type: 'text', hint: 'Shown on the canvas, e.g. "Mobile users"' },
    { key: 'rps', label: 'Requests per second', type: 'number', min: 0, step: 1 },
    {
      key: 'pattern',
      label: 'Traffic pattern',
      type: 'select',
      options: [
        { value: 'steady', label: 'Steady' },
        { value: 'burst', label: 'Burst' },
      ],
    },
    { key: 'burstEvery', label: 'Burst every (ms)', type: 'number', min: 100, step: 100 },
    { key: 'burstSize', label: 'Burst size', type: 'number', min: 1, step: 1 },
    { key: 'clients', label: 'Distinct clients', type: 'number', min: 1, step: 1, hint: 'Used by IP hash, per-client rate limits, DNS' },
    { key: 'keyspace', label: 'Distinct keys', type: 'number', min: 1, step: 1, hint: 'Fewer keys → more cache hits' },
    { key: 'timeoutMs', label: 'Client timeout (ms)', type: 'number', min: 100, step: 100 },
  ],
  lb: [
    {
      key: 'algorithm',
      label: 'Algorithm',
      type: 'select',
      options: [
        { value: 'roundRobin', label: 'Round Robin' },
        { value: 'weightedRoundRobin', label: 'Weighted Round Robin' },
        { value: 'leastConnections', label: 'Least Connections' },
        { value: 'ipHash', label: 'IP Hash (sticky)' },
        { value: 'random', label: 'Random' },
      ],
    },
    { key: 'weights', label: 'Weights', type: 'weights', hint: 'Weighted Round Robin only' },
    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', min: 100, step: 100 },
    { key: 'retries', label: 'Retries', type: 'number', min: 0, step: 1 },
    { key: 'healthCheck', label: 'Health check (skip down servers)', type: 'boolean' },
  ],
  server: [
    { key: 'capacity', label: 'Capacity (concurrent)', type: 'number', min: 1, step: 1 },
    { key: 'processingMs', label: 'Processing time (ms)', type: 'number', min: 1, step: 50 },
    { key: 'queueSize', label: 'Queue size', type: 'number', min: 0, step: 1, hint: '0 = drop when full' },
    { key: 'failureRate', label: 'Failure rate', type: 'number', ...pct },
    { key: 'jitterMs', label: 'Jitter (ms)', type: 'number', min: 0, step: 50 },
    { key: 'warmupMs', label: 'Warm-up (ms)', type: 'number', min: 0, step: 500, hint: 'Processing doubled while warming up' },
    { key: 'cacheTimeoutMs', label: 'Cache timeout (ms)', type: 'number', min: 10, step: 50, hint: 'No answer from the cache in time counts as a miss' },
    { key: 'backendTimeoutMs', label: 'Backend timeout (ms)', type: 'number', min: 100, step: 500, hint: 'No answer from the backend in time fails the request' },
  ],
  cache: [
    { key: 'maxEntries', label: 'Max entries', type: 'number', min: 1, step: 1 },
    { key: 'ttlMs', label: 'TTL (ms)', type: 'number', min: 100, step: 500 },
    { key: 'latencyMs', label: 'Latency (ms)', type: 'number', min: 0, step: 5 },
  ],
  cdn: [
    { key: 'maxEntries', label: 'Max entries', type: 'number', min: 1, step: 1 },
    { key: 'ttlMs', label: 'TTL (ms)', type: 'number', min: 100, step: 500 },
    { key: 'latencyMs', label: 'Latency (ms)', type: 'number', min: 0, step: 5 },
  ],
  rateLimiter: [
    {
      key: 'algorithm',
      label: 'Algorithm',
      type: 'select',
      options: [
        { value: 'tokenBucket', label: 'Token Bucket' },
        { value: 'fixedWindow', label: 'Fixed Window' },
        { value: 'slidingWindow', label: 'Sliding Window' },
      ],
    },
    { key: 'ratePerSec', label: 'Rate (per second)', type: 'number', min: 0, step: 1 },
    { key: 'burst', label: 'Burst / window allowance', type: 'number', min: 1, step: 1 },
    { key: 'perClient', label: 'Per client', type: 'boolean' },
  ],
  apiGateway: [
    { key: 'latencyMs', label: 'Latency (ms)', type: 'number', min: 0, step: 5 },
    { key: 'authFailRate', label: 'Auth failure rate', type: 'number', ...pct },
  ],
  database: [
    { key: 'capacity', label: 'Capacity (concurrent)', type: 'number', min: 1, step: 1 },
    { key: 'latencyMs', label: 'Query latency (ms)', type: 'number', min: 1, step: 10 },
    { key: 'replicas', label: 'Read replicas', type: 'number', min: 0, step: 1 },
    { key: 'readRatio', label: 'Read ratio', type: 'number', ...pct },
  ],
  queue: [{ key: 'maxSize', label: 'Max size', type: 'number', min: 1, step: 1 }],
  consumer: [
    { key: 'capacity', label: 'Capacity (concurrent)', type: 'number', min: 1, step: 1 },
    { key: 'processingMs', label: 'Processing time (ms)', type: 'number', min: 1, step: 50 },
    { key: 'failureRate', label: 'Failure rate', type: 'number', ...pct },
    { key: 'maxRetries', label: 'Max retries', type: 'number', min: 0, step: 1, hint: 'Then dead-letter to a connected queue' },
  ],
  dns: [
    { key: 'latencyMs', label: 'Lookup latency (ms)', type: 'number', min: 0, step: 10 },
    { key: 'ttlMs', label: 'TTL (ms)', type: 'number', min: 100, step: 500 },
  ],
  circuitBreaker: [
    { key: 'failureThreshold', label: 'Failure threshold', type: 'number', min: 1, step: 1 },
    { key: 'windowMs', label: 'Window (ms)', type: 'number', min: 100, step: 500 },
    { key: 'openMs', label: 'Open for (ms)', type: 'number', min: 100, step: 500 },
  ],
  thirdParty: [
    { key: 'latencyMs', label: 'Latency (ms)', type: 'number', min: 0, step: 10 },
    { key: 'jitterMs', label: 'Jitter (ms)', type: 'number', min: 0, step: 10 },
    { key: 'failureRate', label: 'Failure rate', type: 'number', ...pct },
  ],
}

export const EDGE_FIELDS: Field[] = [
  { key: 'latencyMs', label: 'Latency (ms)', type: 'number', min: 1, step: 50 },
  { key: 'lossPct', label: 'Packet loss (%)', type: 'number', min: 0, max: 100, step: 1 },
]

/** One-line summary shown under the node title. */
export function summary(type: NodeType, c: NodeConfig): string {
  const x = c as unknown as Record<string, unknown>
  switch (type) {
    case 'world':
      return x.pattern === 'burst' ? `${x.burstSize} every ${x.burstEvery}ms` : `${x.rps} rps`
    case 'lb':
      return `${x.algorithm}${x.retries ? ` · ${x.retries} retries` : ''}`
    case 'server':
      return `cap ${x.capacity} · ${x.processingMs}ms${x.down ? ' · DOWN' : ''}`
    case 'cache':
    case 'cdn':
      return `${x.maxEntries} entries · ttl ${x.ttlMs}ms`
    case 'rateLimiter':
      return `${x.algorithm} · ${x.ratePerSec}/s`
    case 'apiGateway':
      return `${x.latencyMs}ms`
    case 'database':
      return `cap ${x.capacity} · ${x.replicas} replicas${x.down ? ' · DOWN' : ''}`
    case 'queue':
      return `max ${x.maxSize}`
    case 'consumer':
      return `cap ${x.capacity} · ${x.processingMs}ms`
    case 'dns':
      return `${x.latencyMs}ms · ttl ${x.ttlMs}ms`
    case 'circuitBreaker':
      return `${x.failureThreshold} failures / ${x.windowMs}ms`
    case 'thirdParty':
      return `${x.latencyMs}ms · fail ${Math.round(Number(x.failureRate) * 100)}%${x.down ? ' · DOWN' : ''}`
  }
}

export const EDGE_SUMMARY = (c: EdgeConfig) => `${c.latencyMs}ms${c.lossPct ? ` · ${c.lossPct}% loss` : ''}`
