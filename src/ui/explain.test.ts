import { describe, it, expect } from 'vitest'
import { serverLinkLabels } from './explain'

const nodes = [
  { id: 'w', type: 'world' },
  { id: 's', type: 'server' },
  { id: 'c', type: 'cache' },
  { id: 'c2', type: 'cache' },
  { id: 'db', type: 'database' },
  { id: 'q', type: 'queue' },
]

describe('server link labels', () => {
  it('label the cache first, the backend "on miss", and links the server never uses as ignored', () => {
    const edges = [
      { id: 'w-s', source: 'w', target: 's' },
      { id: 's-db', source: 's', target: 'db' },
      { id: 's-c', source: 's', target: 'c' },
      { id: 's-q', source: 's', target: 'q' },
      { id: 's-c2', source: 's', target: 'c2' },
    ]
    expect(Object.fromEntries(serverLinkLabels(nodes, edges))).toEqual({ 's-c': '① cache', 's-db': '② on miss', 's-q': 'ignored', 's-c2': 'ignored' })
  })

  it('a server with only a backend needs no labels', () => {
    expect(serverLinkLabels(nodes, [{ id: 's-db', source: 's', target: 'db' }]).size).toBe(0)
  })
})
