import type { NodeType, Route } from '../engine/types'

/** How each component uses its links, in one sentence. Mirrors the handlers in src/engine/nodes/. */
export const ROUTING: Record<NodeType, string> = {
  world: 'Sends requests to its links in turn and waits for the answers. With routes, each request picks one from the traffic mix.',
  lb: 'Picks one link per request using its algorithm; retries and health checks happen here. Only links that carry the request’s route count.',
  server:
    'Asks a linked Cache or CDN first; on a miss calls its other links one after another (e.g. a Database, then a payment API), then fills the cache. Links that don’t carry the request’s route are skipped.',
  cache: 'Answers hits itself. On a miss it forwards to its link if it has one (read-through), otherwise answers "miss" so the caller fetches. Writes pass straight through.',
  cdn: 'Answers hits itself. On a miss it forwards to its link if it has one (read-through), otherwise answers "miss" so the caller fetches. Writes pass straight through.',
  dns: 'Looks up the address, faster when it is still cached, then passes the request on.',
  apiGateway: 'Adds a little latency and may reject unauthorised requests, then passes the rest on to a link that carries their route.',
  rateLimiter: 'Lets requests through up to its rate and rejects the rest straight away.',
  circuitBreaker: 'Passes calls to its link while closed. After enough failures it opens and rejects instantly, then lets one test call through.',
  queue: 'Accepts jobs instantly and holds them. Consumers linked from it pull the work.',
  consumer: 'Pulls jobs from queues that link to it. When retries run out, sends the job to a queue it links to (dead-letter queue).',
  database: 'End of the line: answers after its latency. A request’s route says whether it is a read or a write; without one, the read ratio decides.',
  thirdParty: 'End of the line: answers after its latency and fails at its failure rate.',
}

export const LINK_EXPLAIN =
  'Carries requests one way and answers back; its latency and packet loss apply in both directions. Tick routes to make it carry only those.'

const CACHE_TYPES = new Set(['cache', 'cdn'])
const STEP = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨']

/** Labels for each server's links in the order the server uses them (see src/engine/nodes/server.ts). */
export function serverLinkLabels(nodes: { id: string; type?: string }[], edges: { id: string; source: string; target: string }[]): Map<string, string> {
  const typeOf = new Map(nodes.map((n) => [n.id, n.type ?? '']))
  const bySource = new Map<string, typeof edges>()
  for (const e of edges) if (typeOf.get(e.source) === 'server') bySource.set(e.source, [...(bySource.get(e.source) ?? []), e])

  const labels = new Map<string, string>()
  for (const links of bySource.values()) {
    const cache = links.find((e) => CACHE_TYPES.has(typeOf.get(e.target) ?? ''))
    const steps = links.filter((e) => !CACHE_TYPES.has(typeOf.get(e.target) ?? ''))
    if (!cache && steps.length < 2) continue // one backend: nothing to explain
    for (const e of links) {
      const i = steps.indexOf(e)
      if (e === cache) labels.set(e.id, '① cache')
      else if (i < 0) labels.set(e.id, 'ignored') // a second cache
      else {
        const n = STEP[i + (cache ? 1 : 0)] ?? `${i + 1}`
        labels.set(e.id, i === 0 && cache ? `${n} on miss` : n)
      }
    }
  }
  return labels
}

/** Every link label on the canvas: the server step order, plus the routes a tagged link carries. */
export function linkLabels(
  nodes: { id: string; type?: string }[],
  edges: { id: string; source: string; target: string; data?: { config?: { routes?: string[] } } }[],
  routes: Route[],
): Map<string, string> {
  const labels = serverLinkLabels(nodes, edges)
  const nameOf = new Map(routes.map((r) => [r.id, r.name]))
  for (const e of edges) {
    const names = (e.data?.config?.routes ?? []).map((id) => nameOf.get(id)).filter((n): n is string => n !== undefined)
    if (names.length === 0) continue
    const step = labels.get(e.id)
    labels.set(e.id, step ? `${step} · ${names.join(', ')}` : names.join(', '))
  }
  return labels
}
