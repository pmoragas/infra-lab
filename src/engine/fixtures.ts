import { DEFAULT_CONFIG } from './defaults'
import type { ConfigByType, LabEdge, LabNode, NodeType, Project } from './types'

/** Small builder for test topologies. */
export function project(seed = 42) {
  const nodes: LabNode[] = []
  const edges: LabEdge[] = []
  const api = {
    node<K extends NodeType>(id: string, type: K, config: Partial<ConfigByType[K]> = {}) {
      nodes.push({ id, type, position: { x: 0, y: 0 }, config: { ...DEFAULT_CONFIG[type], ...config } })
      return api
    },
    edge(source: string, target: string, config?: LabEdge['config']) {
      edges.push({ id: `e-${source}-${target}`, source, target, config })
      return api
    },
    build(): Project {
      return { id: 'p', name: 'test', nodes, edges, settings: { seed, speed: 1 } }
    },
  }
  return api
}

/** World → LB → N servers. */
export function wlsProject(
  servers = 2,
  o: {
    world?: Partial<ConfigByType['world']>
    lb?: Partial<ConfigByType['lb']>
    server?: Partial<ConfigByType['server']>
    seed?: number
    edge?: LabEdge['config']
  } = {},
): Project {
  const p = project(o.seed).node('world', 'world', { rps: 2, ...o.world }).node('lb', 'lb', o.lb).edge('world', 'lb', o.edge)
  for (let i = 1; i <= servers; i++) p.node(`s${i}`, 'server', o.server).edge('lb', `s${i}`, o.edge)
  return p.build()
}
