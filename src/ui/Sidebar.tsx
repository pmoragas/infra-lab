import type { DragEvent } from 'react'
import { DRAG_MIME } from '../canvas/Canvas'
import { useLabStore } from '../store/useLabStore'
import { DEFAULT_CONFIG, LABEL } from '../engine/defaults'
import { summary } from './configSchema'
import type { NodeType } from '../engine/types'

const GROUPS: { title: string; shape: string; types: NodeType[] }[] = [
  { title: 'Traffic', shape: 'circle', types: ['world'] },
  { title: 'Edge & routing', shape: 'diamond', types: ['dns', 'cdn', 'apiGateway', 'rateLimiter', 'lb', 'circuitBreaker'] },
  { title: 'Compute', shape: 'square', types: ['server', 'consumer'] },
  { title: 'Data & messaging', shape: 'stack', types: ['cache', 'database', 'queue'] },
  { title: 'External', shape: 'external', types: ['thirdParty'] },
]

// Click-to-add lays nodes out in columns by role, stacked per type.
const COLUMN: Record<NodeType, number> = {
  world: 60,
  dns: 260,
  cdn: 260,
  apiGateway: 460,
  rateLimiter: 460,
  lb: 460,
  circuitBreaker: 460,
  server: 700,
  consumer: 700,
  cache: 940,
  database: 940,
  queue: 940,
  thirdParty: 940,
}

export function Sidebar() {
  const addNode = useLabStore((s) => s.addNode)
  const nodes = useLabStore((s) => s.nodes)
  const edgeCount = useLabStore((s) => s.edges.length)

  const place = (type: NodeType) => {
    const sameColumn = nodes.filter((n) => COLUMN[n.type as NodeType] === COLUMN[type]).length
    return { x: COLUMN[type], y: 80 + sameColumn * 110 }
  }

  const onDragStart = (e: DragEvent, type: NodeType) => {
    e.dataTransfer.setData(DRAG_MIME, type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar__intro">
        <div className="eyebrow">Components</div>
        <p className="sidebar__hint">Drag onto the sheet, or click to add.</p>
      </div>
      {GROUPS.map((g) => (
        <div key={g.title} className="sidebar__group">
          <div className="sidebar__group-title">{g.title}</div>
          {g.types.map((type) => (
            <div
              key={type}
              className={`sidebar__item sidebar__item--${type}`}
              draggable
              data-testid={`palette-${type}`}
              onDragStart={(e) => onDragStart(e, type)}
              onClick={() => addNode(type, place(type))}
            >
              <span className={`shape shape--${g.shape}`} />
              <span className="sidebar__text">
                <span className="sidebar__label">{LABEL[type]}</span>
                <span className="sidebar__sub">{summary(type, DEFAULT_CONFIG[type])}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="sheet">
        <div className="eyebrow">Sheet</div>
        <div className="sheet__grid">
          <div className="sheet__cell">
            <div className="sheet__value">{nodes.length}</div>
            <div className="sheet__label">nodes</div>
          </div>
          <div className="sheet__cell">
            <div className="sheet__value">{edgeCount}</div>
            <div className="sheet__label">links</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
