import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useLabStore, type LabFlowNode } from '../../store/useLabStore'
import { LABEL } from '../../engine/defaults'
import { summary } from '../../ui/configSchema'
import { ROUTING } from '../../ui/explain'
import type { NodeType, WorldConfig } from '../../engine/types'

const NO_TARGET = new Set<NodeType>(['world'])
const NO_SOURCE = new Set<NodeType>(['database', 'thirdParty'])
const LOAD_TYPES = new Set<NodeType>(['server', 'database', 'consumer', 'queue'])
const FLASH_MS = 3000 // of sim time a flush stays marked on its cache

function statLine(type: NodeType, s: { loadPct: number; hits: number; misses: number; rejected: number; state?: string; queued: number } | undefined) {
  if (!s) return ''
  switch (type) {
    case 'server':
    case 'database':
    case 'consumer':
      return `${s.loadPct}%${s.queued ? ` · q${s.queued}` : ''}`
    case 'queue':
      return `${s.queued} queued`
    case 'cache':
    case 'cdn':
    case 'dns':
      return `${s.loadPct}% hit`
    case 'rateLimiter':
    case 'apiGateway':
      return `${s.rejected} rejected`
    case 'circuitBreaker':
      return s.state ?? 'closed'
    default:
      return ''
  }
}

export function LabNode(props: NodeProps<LabFlowNode>) {
  const type = props.type as NodeType
  const stats = useLabStore((s) => s.sim?.stats.nodes[props.id])
  const loadPct = stats?.loadPct ?? 0
  const overloaded = LOAD_TYPES.has(type) && loadPct > 80
  const chaosDown = useLabStore((s) => s.sim?.chaos.down.includes(props.id) ?? false)
  const spike = useLabStore((s) => s.sim?.chaos.spikes[props.id])
  const flushed = useLabStore((s) => {
    const sim = s.sim
    return !!sim && sim.events.some((e) => e.kind === 'flush' && e.target === props.id && sim.now - e.atMs < FLASH_MS)
  })
  const down = (props.data.config as { down?: boolean }).down === true || chaosDown
  const title = type === 'world' ? (props.data.config as WorldConfig).name || LABEL.world : LABEL[type]
  const chaosTag = down ? 'down' : spike ? `spike ×${spike}` : flushed ? 'flushed' : null

  return (
    <div
      className={[
        'lab-node',
        `lab-node--${type}`,
        overloaded ? 'lab-node--overloaded' : '',
        down ? 'lab-node--down' : '',
        spike ? 'lab-node--spiked' : '',
        flushed ? 'lab-node--flushed' : '',
        props.selected ? 'lab-node--selected' : '',
      ].join(' ')}
      data-testid={`node-${type}`}
      data-node-id={props.id}
      data-load={loadPct}
      title={ROUTING[type]}
    >
      {!NO_TARGET.has(type) && <Handle type="target" position={Position.Left} />}
      <div className="lab-node__head">
        <span className="lab-node__title">{title}</span>
        {chaosTag ? (
          <span className="lab-node__tag">⚡ {chaosTag}</span>
        ) : (
          <span className="lab-node__id">{overloaded ? 'saturated' : props.id}</span>
        )}
      </div>
      <div className="lab-node__sub">{summary(type, props.data.config)}</div>
      {stats &&
        (LOAD_TYPES.has(type) ? (
          <div className="lab-node__load">
            <span className="lab-node__bar">
              <span className="lab-node__fill" style={{ width: `${Math.min(100, loadPct)}%` }} />
            </span>
            <span className="lab-node__pct" data-testid="node-stat">
              {statLine(type, stats)}
            </span>
          </div>
        ) : (
          <div className="lab-node__stat" data-testid="node-stat">
            {statLine(type, stats)}
          </div>
        ))}
      {!NO_SOURCE.has(type) && <Handle type="source" position={Position.Right} />}
    </div>
  )
}
