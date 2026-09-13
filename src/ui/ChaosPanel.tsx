import { useState } from 'react'
import { useLabStore } from '../store/useLabStore'
import type { Failure, FailureKind } from '../engine/types'

const KINDS: { value: FailureKind; label: string; hint: string }[] = [
  { value: 'kill', label: 'Kill node', hint: 'The node stops answering for the duration, then comes back (servers warm up again).' },
  { value: 'partition', label: 'Partition link', hint: 'Everything on the link is lost for the duration.' },
  { value: 'spike', label: 'Traffic spike', hint: 'A World sends its traffic × factor for the duration.' },
  { value: 'flush', label: 'Cache flush', hint: 'A cache or CDN forgets everything at once: a cache-miss storm.' },
]

const kindLabel = (k: FailureKind) => KINDS.find((x) => x.value === k)!.label
const sec = (ms: number) => `${Number((ms / 1000).toFixed(1))}s`

export function ChaosPanel() {
  const failures = useLabStore((s) => s.failures)
  const nodes = useLabStore((s) => s.nodes)
  const edges = useLabStore((s) => s.edges)
  const now = useLabStore((s) => s.sim?.now ?? 0)
  const { addFailure, removeFailure, openPanel } = useLabStore.getState()
  const [kind, setKind] = useState<FailureKind>('kill')
  const [target, setTarget] = useState('')
  const [at, setAt] = useState(5)
  const [duration, setDuration] = useState(5)
  const [factor, setFactor] = useState(5)

  const targets =
    kind === 'partition'
      ? edges.map((e) => ({ id: e.id, label: `${e.source} → ${e.target}` }))
      : nodes
          .filter((n) => kind === 'kill' || (kind === 'spike' ? n.type === 'world' : n.type === 'cache' || n.type === 'cdn'))
          .map((n) => ({ id: n.id, label: n.id }))
  const chosen = targets.some((t) => t.id === target) ? target : (targets[0]?.id ?? '')

  const add = () => {
    if (!chosen) return
    addFailure({
      kind,
      target: chosen,
      atMs: Math.max(0, at) * 1000,
      durationMs: kind === 'flush' ? 0 : Math.max(0.1, duration) * 1000,
      factor: kind === 'spike' ? Math.max(1, factor) : 1,
    })
  }

  const active = (f: Failure) => f.kind !== 'flush' && now >= f.atMs && now < f.atMs + f.durationMs

  return (
    <section className="drawer" data-testid="chaos-panel">
      <div className="drawer__head">
        <div className="eyebrow">Chaos</div>
        <button className="btn btn--icon" aria-label="Close" onClick={() => openPanel(null)}>
          ×
        </button>
      </div>
      <p className="drawer__intro">Schedule failures in sim time. To break something right now, use Kill node or Cut link in the inspector.</p>
      <div className="chaos__form">
        <label>
          Failure
          <select data-testid="chaos-kind" value={kind} onChange={(e) => setKind(e.target.value as FailureKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target
          <select data-testid="chaos-target" value={chosen} disabled={targets.length === 0} onChange={(e) => setTarget(e.target.value)}>
            {targets.length === 0 && <option value="">No matching components</option>}
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="chaos__row">
          <label>
            At (s)
            <input data-testid="chaos-at" type="number" min={0} step={1} value={at} onChange={(e) => setAt(Number(e.target.value))} />
          </label>
          {kind !== 'flush' && (
            <label>
              For (s)
              <input data-testid="chaos-duration" type="number" min={1} step={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </label>
          )}
          {kind === 'spike' && (
            <label>
              Factor
              <input data-testid="chaos-factor" type="number" min={1} step={1} value={factor} onChange={(e) => setFactor(Number(e.target.value))} />
            </label>
          )}
        </div>
        <span className="config__hint">{KINDS.find((k) => k.value === kind)!.hint}</span>
        <button className="btn btn--primary" data-testid="chaos-add" disabled={!chosen} onClick={add}>
          Add failure
        </button>
      </div>
      <div className="eyebrow">Scheduled</div>
      {failures.length === 0 ? (
        <p className="drawer__empty">No failures scheduled.</p>
      ) : (
        <ul className="chaos__list">
          {[...failures]
            .sort((a, b) => a.atMs - b.atMs)
            .map((f) => (
              <li key={f.id} data-testid="failure-item" className={`chaos__item${active(f) ? ' chaos__item--active' : ''}`}>
                <span className="chaos__when">
                  {sec(f.atMs)}
                  {f.kind !== 'flush' ? `–${sec(f.atMs + f.durationMs)}` : ''}
                </span>
                <span className="chaos__what">
                  {kindLabel(f.kind)}
                  {f.kind === 'spike' ? ` ×${f.factor}` : ''} <span className="chaos__target">{f.target}</span>
                </span>
                <button className="btn btn--icon" aria-label="Remove failure" data-testid="failure-remove" onClick={() => removeFailure(f.id)}>
                  ×
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}
