import { describe, it, expect } from 'vitest'
import { linkLabels, serverLinkLabels } from './explain'

const nodes = [
  { id: 'w', type: 'world' },
  { id: 's', type: 'server' },
  { id: 'c', type: 'cache' },
  { id: 'c2', type: 'cache' },
  { id: 'db', type: 'database' },
  { id: 'q', type: 'queue' },
]

describe('server link labels', () => {
  it('label the cache first, then the steps in link order, and a second cache as ignored', () => {
    const edges = [
      { id: 'w-s', source: 'w', target: 's' },
      { id: 's-db', source: 's', target: 'db' },
      { id: 's-c', source: 's', target: 'c' },
      { id: 's-q', source: 's', target: 'q' },
      { id: 's-c2', source: 's', target: 'c2' },
    ]
    expect(Object.fromEntries(serverLinkLabels(nodes, edges))).toEqual({ 's-c': '① cache', 's-db': '② on miss', 's-q': '③', 's-c2': 'ignored' })
  })

  it('number the steps from ① when there is no cache', () => {
    const edges = [
      { id: 's-db', source: 's', target: 'db' },
      { id: 's-q', source: 's', target: 'q' },
    ]
    expect(Object.fromEntries(serverLinkLabels(nodes, edges))).toEqual({ 's-db': '①', 's-q': '②' })
  })

  it('a server with only a backend needs no labels', () => {
    expect(serverLinkLabels(nodes, [{ id: 's-db', source: 's', target: 'db' }]).size).toBe(0)
  })
})

describe('link labels with routes', () => {
  const routes = [
    { id: 'browse', name: 'GET /products', kind: 'read' as const },
    { id: 'checkout', name: 'POST /checkout', kind: 'write' as const },
  ]

  it('append the carried route names to the step label, or stand alone on other links', () => {
    const edges = [
      { id: 'w-s', source: 'w', target: 's', data: { config: { routes: ['checkout'] } } },
      { id: 's-c', source: 's', target: 'c', data: { config: { routes: ['browse'] } } },
      { id: 's-db', source: 's', target: 'db', data: { config: { routes: ['browse', 'checkout'] } } },
      { id: 's-q', source: 's', target: 'q', data: { config: { routes: [] } } },
    ]
    expect(Object.fromEntries(linkLabels(nodes, edges, routes))).toEqual({
      'w-s': 'POST /checkout',
      's-c': '① cache · GET /products',
      's-db': '② on miss · GET /products, POST /checkout',
      's-q': '③',
    })
  })
})
