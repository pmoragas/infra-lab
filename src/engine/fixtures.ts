import type { Project, Intensity, Algorithm } from './types'

/** World → LB → N servers. Shared by tests. */
export function wlsProject(
  servers = 2,
  o: { intensity?: Intensity; algorithm?: Algorithm; capacity?: number; processingMs?: number; seed?: number } = {},
): Project {
  const nodes: Project['nodes'] = [
    { id: 'world', type: 'world', position: { x: 0, y: 0 }, config: { intensity: o.intensity ?? 'normal' } },
    { id: 'lb', type: 'lb', position: { x: 200, y: 0 }, config: { algorithm: o.algorithm ?? 'roundRobin' } },
  ]
  const edges: Project['edges'] = [{ id: 'e-world-lb', source: 'world', target: 'lb' }]
  for (let i = 1; i <= servers; i++) {
    nodes.push({
      id: `s${i}`,
      type: 'server',
      position: { x: 400, y: i * 100 },
      config: { capacity: o.capacity ?? 5, processingMs: o.processingMs ?? 300 },
    })
    edges.push({ id: `e-lb-s${i}`, source: 'lb', target: `s${i}` })
  }
  return { id: 'p', name: 'wls', nodes, edges, settings: { seed: o.seed ?? 42 } }
}
