import { useState } from 'react'
import { useLabStore } from '../store/useLabStore'
import type { RouteKind } from '../engine/types'

const KINDS: { value: RouteKind; label: string }[] = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
]

/** The kinds of request in this project. Worlds send a mix of them; links say which they carry. */
export function RoutesPanel() {
  const routes = useLabStore((s) => s.routes)
  const { addRoute, updateRoute, removeRoute, openPanel } = useLabStore.getState()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<RouteKind>('read')

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addRoute({ name: trimmed, kind })
    setName('')
  }

  return (
    <section className="drawer" data-testid="routes-panel">
      <div className="drawer__head">
        <div className="eyebrow">Routes</div>
        <button className="btn btn--icon" aria-label="Close" onClick={() => openPanel(null)}>
          ×
        </button>
      </div>
      <p className="drawer__intro">
        Kinds of request, like GET /products or POST /checkout. Set each World's traffic mix, then tick on a link which routes it carries. Reads can be
        cached; writes pass through caches and hit the database primary.
      </p>
      <div className="chaos__form">
        <div className="chaos__row">
          <label>
            Name
            <input
              data-testid="route-name"
              type="text"
              placeholder="GET /products"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
          </label>
          <label>
            Kind
            <select data-testid="route-kind" value={kind} onChange={(e) => setKind(e.target.value as RouteKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn btn--primary" data-testid="route-add" disabled={!name.trim()} onClick={add}>
          Add route
        </button>
      </div>
      <div className="eyebrow">Defined</div>
      {routes.length === 0 ? (
        <p className="drawer__empty">No routes yet. Without any, every request is the same and every link carries it.</p>
      ) : (
        <ul className="chaos__list">
          {routes.map((r) => (
            <li key={r.id} data-testid="route-item" className="chaos__item routes__item">
              <select aria-label="Route kind" data-testid="route-item-kind" value={r.kind} onChange={(e) => updateRoute(r.id, { kind: e.target.value as RouteKind })}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <span className="chaos__what">
                {r.name} <span className="chaos__target">{r.id}</span>
              </span>
              <button className="btn btn--icon" aria-label={`Remove ${r.name}`} data-testid="route-remove" onClick={() => removeRoute(r.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
