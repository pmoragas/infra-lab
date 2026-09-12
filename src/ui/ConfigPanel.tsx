import { useLabStore } from '../store/useLabStore'
import type { Algorithm, Intensity, LbConfig, ServerConfig, WorldConfig } from '../engine/types'

const INTENSITIES: Intensity[] = ['slow', 'normal', 'fast', 'burst']
const ALGORITHMS: { value: Algorithm; label: string }[] = [
  { value: 'roundRobin', label: 'Round Robin' },
  { value: 'random', label: 'Random' },
  { value: 'leastConnections', label: 'Least Connections' },
]

export function ConfigPanel() {
  const selectedId = useLabStore((s) => s.selectedId)
  const node = useLabStore((s) => s.nodes.find((n) => n.id === s.selectedId))
  const update = useLabStore((s) => s.updateNodeConfig)
  const remove = useLabStore((s) => s.removeNode)
  const stats = useLabStore((s) => (node?.type === 'server' ? s.sim?.stats.servers[node.id] : undefined))
  const lbStats = useLabStore((s) => (node?.type === 'lb' ? s.sim?.stats.lbs[node.id] : undefined))

  if (!selectedId || !node) return null
  const c = node.data.config

  return (
    <aside className="config" data-testid="config-panel" data-node-id={node.id}>
      <h2>{node.type === 'world' ? 'World' : node.type === 'lb' ? 'Load Balancer' : 'Server'}</h2>
      <div className="config__id">{node.id}</div>

      {node.type === 'world' && (
        <label>
          Traffic intensity
          <select
            data-testid="cfg-intensity"
            value={(c as WorldConfig).intensity}
            onChange={(e) => update(node.id, { intensity: e.target.value as Intensity })}
          >
            {INTENSITIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
      )}

      {node.type === 'lb' && (
        <>
          <label>
            Algorithm
            <select
              data-testid="cfg-algorithm"
              value={(c as LbConfig).algorithm}
              onChange={(e) => update(node.id, { algorithm: e.target.value as Algorithm })}
            >
              {ALGORITHMS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          {lbStats && (
            <div className="config__stats">
              <div>routed: {lbStats.routed}</div>
              {Object.entries(lbStats.perServer).map(([id, n]) => (
                <div key={id}>
                  {id}: {n}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {node.type === 'server' && (
        <>
          <label>
            Capacity (concurrent)
            <input
              data-testid="cfg-capacity"
              type="number"
              min={1}
              value={(c as ServerConfig).capacity}
              onChange={(e) => update(node.id, { capacity: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          <label>
            Processing time (ms)
            <input
              data-testid="cfg-processing"
              type="number"
              min={1}
              step={50}
              value={(c as ServerConfig).processingMs}
              onChange={(e) => update(node.id, { processingMs: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          {stats && (
            <div className="config__stats">
              <div>active: {stats.active}</div>
              <div>processed: {stats.processed}</div>
              <div>dropped: {stats.dropped}</div>
            </div>
          )}
        </>
      )}

      <button className="config__delete" data-testid="cfg-delete" onClick={() => remove(node.id)}>
        Delete
      </button>
    </aside>
  )
}
