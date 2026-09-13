import { useEffect, useRef, useState, type DragEvent } from 'react'
import { DRAG_MIME } from '../canvas/Canvas'
import { useLabStore } from '../store/useLabStore'
import { DEFAULT_CONFIG, LABEL } from '../engine/defaults'
import { summary } from './configSchema'
import { ROUTING } from './explain'
import type { NodeType } from '../engine/types'

const GROUPS: { key: string; title: string; shape: string; types: NodeType[] }[] = [
  { key: 'traffic', title: 'Traffic', shape: 'circle', types: ['world'] },
  { key: 'edge', title: 'Edge & routing', shape: 'diamond', types: ['dns', 'cdn', 'apiGateway', 'rateLimiter', 'lb', 'circuitBreaker'] },
  { key: 'compute', title: 'Compute', shape: 'square', types: ['server', 'consumer'] },
  { key: 'data', title: 'Data & messaging', shape: 'stack', types: ['cache', 'database', 'queue'] },
  { key: 'external', title: 'External', shape: 'external', types: ['thirdParty'] },
]

const MAX_RECENTS = 4

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

function matchesQuery(type: NodeType, query: string) {
  if (!query) return true
  const q = query.toLowerCase()
  return LABEL[type].toLowerCase().includes(q) || summary(type, DEFAULT_CONFIG[type]).toLowerCase().includes(q)
}

export function Sidebar() {
  const addNode = useLabStore((s) => s.addNode)
  const nodes = useLabStore((s) => s.nodes)
  const edgeCount = useLabStore((s) => s.edges.length)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(GROUPS.map((g) => [g.key, true])))
  const [recents, setRecents] = useState<NodeType[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" focuses the palette search, unless the user is already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const place = (type: NodeType) => {
    const sameColumn = nodes.filter((n) => COLUMN[n.type as NodeType] === COLUMN[type]).length
    return { x: COLUMN[type], y: 80 + sameColumn * 110 }
  }

  const add = (type: NodeType) => {
    addNode(type, place(type))
    setRecents((r) => [type, ...r.filter((t) => t !== type)].slice(0, MAX_RECENTS))
  }

  const onDragStart = (e: DragEvent, type: NodeType) => {
    e.dataTransfer.setData(DRAG_MIME, type)
    e.dataTransfer.effectAllowed = 'move'
  }

  const item = (type: NodeType, shape: string) => (
    <div
      key={type}
      className={`sidebar__item sidebar__item--${type}`}
      draggable
      title={ROUTING[type]}
      data-testid={`palette-${type}`}
      onDragStart={(e) => onDragStart(e, type)}
      onClick={() => add(type)}
    >
      <span className={`shape shape--${shape}`} />
      <span className="sidebar__text">
        <span className="sidebar__label">{LABEL[type]}</span>
        <span className="sidebar__sub">{summary(type, DEFAULT_CONFIG[type])}</span>
      </span>
    </div>
  )

  const trimmed = query.trim()
  const flat = trimmed ? GROUPS.flatMap((g) => g.types.filter((t) => matchesQuery(t, trimmed)).map((t) => ({ type: t, shape: g.shape }))) : []

  return (
    <div className="sidebar-shell">
      <div className="sidebar-rail">
        <button
          className={`sidebar-rail__btn${open ? ' sidebar-rail__btn--active' : ''}`}
          title="Components"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          ⌕
        </button>
      </div>

      <aside className={`sidebar${open ? ' sidebar--open' : ''}`} data-testid="sidebar">
        <div className="sidebar__intro">
          <div className="eyebrow">Components</div>
          <p className="sidebar__hint">Drag onto the sheet, or click to add.</p>
        </div>

        <div className="sidebar__search">
          <input
            ref={searchRef}
            className="sidebar__search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search components…"
            data-testid="palette-search"
          />
          <span className="sidebar__search-kbd">/</span>
        </div>

        {trimmed ? (
          <div className="sidebar__flat">
            <div className="sidebar__result-count">
              {flat.length} {flat.length === 1 ? 'match' : 'matches'}
            </div>
            {flat.map(({ type, shape }) => item(type, shape))}
          </div>
        ) : (
          <>
            {recents.length > 0 && (
              <div className="sidebar__recents">
                <div className="sidebar__group-title">Recent</div>
                <div className="sidebar__recent-row">
                  {recents.map((type) => (
                    <button key={type} className="sidebar__recent-chip" data-testid={`recent-${type}`} onClick={() => add(type)}>
                      {LABEL[type]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {GROUPS.map((g) => (
              <div key={g.key} className="sidebar__group">
                <button
                  className="sidebar__group-toggle"
                  aria-expanded={openGroups[g.key]}
                  onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !o[g.key] }))}
                >
                  <span className={`sidebar__caret${openGroups[g.key] ? ' sidebar__caret--open' : ''}`}>▸</span>
                  <span className="sidebar__group-title">{g.title}</span>
                  <span className="sidebar__group-count">{g.types.length}</span>
                </button>
                {openGroups[g.key] && g.types.map((type) => item(type, g.shape))}
              </div>
            ))}
          </>
        )}

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
    </div>
  )
}
