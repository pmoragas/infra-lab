import type { NodeType } from '../engine/types'

/** How each component uses its links, in one sentence. Mirrors the handlers in src/engine/nodes/. */
export const ROUTING: Record<NodeType, string> = {
  world: 'Sends requests to its links in turn and waits for the answers.',
  lb: 'Picks one link per request using its algorithm; retries and health checks happen here.',
  server:
    'Asks a linked Cache or CDN first; on a miss asks its first other link (e.g. a Database), then fills the cache. Extra links are ignored.',
  cache: 'Answers hits itself. On a miss it forwards to its link if it has one (read-through), otherwise answers "miss" so the caller fetches.',
  cdn: 'Answers hits itself. On a miss it forwards to its link if it has one (read-through), otherwise answers "miss" so the caller fetches.',
  dns: 'Looks up the address, faster when it is still cached, then passes the request on.',
  apiGateway: 'Adds a little latency and may reject unauthorised requests, then passes the rest on.',
  rateLimiter: 'Lets requests through up to its rate and rejects the rest straight away.',
  circuitBreaker: 'Passes calls to its link while closed. After enough failures it opens and rejects instantly, then lets one test call through.',
  queue: 'Accepts jobs instantly and holds them. Consumers linked from it pull the work.',
  consumer: 'Pulls jobs from queues that link to it. When retries run out, sends the job to a queue it links to (dead-letter queue).',
  database: 'End of the line: answers after its latency, with reads and writes limited by capacity.',
  thirdParty: 'End of the line: answers after its latency and fails at its failure rate.',
}

export const LINK_EXPLAIN = 'Carries requests one way and answers back; its latency and packet loss apply in both directions.'

const CACHE_TYPES = new Set(['cache', 'cdn'])

/** Labels for each server's links in the order the server uses them (see src/engine/nodes/server.ts). */
export function serverLinkLabels(nodes: { id: string; type?: string }[], edges: { id: string; source: string; target: string }[]): Map<string, string> {
  const typeOf = new Map(nodes.map((n) => [n.id, n.type ?? '']))
  const bySource = new Map<string, typeof edges>()
  for (const e of edges) if (typeOf.get(e.source) === 'server') bySource.set(e.source, [...(bySource.get(e.source) ?? []), e])

  const labels = new Map<string, string>()
  for (const links of bySource.values()) {
    const cache = links.find((e) => CACHE_TYPES.has(typeOf.get(e.target) ?? ''))
    const backend = links.find((e) => !CACHE_TYPES.has(typeOf.get(e.target) ?? ''))
    for (const e of links) {
      if (e === cache) labels.set(e.id, '① cache')
      else if (e === backend) {
        if (cache) labels.set(e.id, '② on miss')
      } else labels.set(e.id, 'ignored')
    }
  }
  return labels
}
