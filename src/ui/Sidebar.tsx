import type { DragEvent } from 'react'
import { DRAG_MIME } from '../canvas/Canvas'
import { useLabStore } from '../store/useLabStore'
import type { NodeType } from '../engine/types'

const ITEMS: { type: NodeType; label: string }[] = [
  { type: 'world', label: 'World' },
  { type: 'lb', label: 'Load Balancer' },
  { type: 'server', label: 'Server Node' },
]

export function Sidebar() {
  const addNode = useLabStore((s) => s.addNode)
  const nodes = useLabStore((s) => s.nodes)

  // Click-to-add lays nodes out in columns: World | LB | Servers, stacked per type.
  const COLUMN: Record<NodeType, number> = { world: 80, lb: 360, server: 640 }
  const place = (type: NodeType) => {
    const same = nodes.filter((n) => n.type === type).length
    return { x: COLUMN[type], y: 80 + same * 110 }
  }

  const onDragStart = (e: DragEvent, type: NodeType) => {
    e.dataTransfer.setData(DRAG_MIME, type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="sidebar" data-testid="sidebar">
      <h2>Components</h2>
      <p className="sidebar__hint">Drag into the project area, or click to add.</p>
      {ITEMS.map((it) => (
        <div
          key={it.type}
          className="sidebar__item"
          draggable
          data-testid={`palette-${it.type}`}
          onDragStart={(e) => onDragStart(e, it.type)}
          onClick={() => addNode(it.type, place(it.type))}
        >
          {it.label}
        </div>
      ))}
    </aside>
  )
}
