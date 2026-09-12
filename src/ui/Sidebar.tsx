import type { DragEvent } from 'react'
import { DRAG_MIME } from '../canvas/Canvas'
import { useLabStore } from '../store/useLabStore'
import { LABEL } from '../engine/defaults'
import type { NodeType } from '../engine/types'

const GROUPS: { title: string; types: NodeType[] }[] = [
  { title: 'Traffic', types: ['world'] },
  { title: 'Edge & routing', types: ['dns', 'cdn', 'apiGateway', 'rateLimiter', 'lb', 'circuitBreaker'] },
  { title: 'Compute', types: ['server', 'consumer'] },
  { title: 'Data & messaging', types: ['cache', 'database', 'queue'] },
  { title: 'External', types: ['thirdParty'] },
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
      <h2>Components</h2>
      <p className="sidebar__hint">Drag into the project area, or click to add.</p>
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
              {LABEL[type]}
            </div>
          ))}
        </div>
      ))}
    </aside>
  )
}
