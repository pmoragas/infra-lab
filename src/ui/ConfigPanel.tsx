import { useLabStore } from '../store/useLabStore'
import { LABEL } from '../engine/defaults'
import { EDGE_FIELDS, NODE_FIELDS, type Field } from './configSchema'
import type { NodeStats, NodeType } from '../engine/types'

function FieldInput({
  field,
  value,
  onChange,
  targets,
}: {
  field: Field
  value: unknown
  onChange: (v: unknown) => void
  targets?: string[]
}) {
  const id = `cfg-${field.key}`
  switch (field.type) {
    case 'number':
      return (
        <label>
          {field.label}
          <input
            data-testid={id}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={value as number}
            onChange={(e) => {
              let n = Number(e.target.value)
              if (!Number.isFinite(n)) n = field.min ?? 0
              if (field.min !== undefined) n = Math.max(field.min, n)
              if (field.max !== undefined) n = Math.min(field.max, n)
              onChange(n)
            }}
          />
          {field.hint && <span className="config__hint">{field.hint}</span>}
        </label>
      )
    case 'select':
      return (
        <label>
          {field.label}
          <select data-testid={id} value={value as string} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {field.hint && <span className="config__hint">{field.hint}</span>}
        </label>
      )
    case 'boolean':
      return (
        <label className="config__check">
          <input data-testid={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      )
    case 'text':
      return (
        <label>
          {field.label}
          <input data-testid={id} type="text" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
          {field.hint && <span className="config__hint">{field.hint}</span>}
        </label>
      )
    case 'weights': {
      const weights = (value as Record<string, number>) ?? {}
      if (!targets || targets.length === 0) return null
      return (
        <div className="config__weights">
          <span>{field.label}</span>
          {targets.map((t) => (
            <label key={t} className="config__weight">
              {t}
              <input
                data-testid={`cfg-weight-${t}`}
                type="number"
                min={0}
                step={1}
                value={weights[t] ?? 1}
                onChange={(e) => onChange({ ...weights, [t]: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          ))}
          {field.hint && <span className="config__hint">{field.hint}</span>}
        </div>
      )
    }
  }
}

const WARN_ROWS = new Set(['dropped', 'failed', 'rejected', 'timeouts'])

function Row({ stat, label, value }: { stat: string; label: string; value: number | string }) {
  return (
    <div className="config__row" data-stat={stat}>
      <span className="config__row-label">{label}</span>
      <span className={`config__row-value${WARN_ROWS.has(stat) ? ' config__row-value--warn' : ''}`}>{value}</span>
    </div>
  )
}

function StatsBlock({ s }: { s: NodeStats | undefined }) {
  if (!s) return null
  const rows: [string, number | string][] = [
    ['in', s.in],
    ['active', s.active],
    ['queued', s.queued],
    ['processed', s.processed],
    ['dropped', s.dropped],
    ['failed', s.failed],
    ['rejected', s.rejected],
    ['hits', s.hits],
    ['misses', s.misses],
    ['retries', s.retries],
    ['timeouts', s.timeouts],
  ]
  return (
    <div className="config__stats" data-testid="node-stats">
      <div className="eyebrow">Live</div>
      {s.state && <Row stat="state" label="state" value={s.state} />}
      {rows
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => (
          <Row key={k} stat={k} label={k} value={v} />
        ))}
      {Object.entries(s.perTarget).map(([id, n]) => (
        <Row key={id} stat={`to:${id}`} label={`→ ${id}`} value={n} />
      ))}
    </div>
  )
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="config__head">
      <div className="eyebrow">Inspector</div>
      <h2 className="config__title">{title}</h2>
      <div className="config__id">{sub}</div>
    </div>
  )
}

export function ConfigPanel() {
  const node = useLabStore((s) => s.nodes.find((n) => n.id === s.selectedId))
  const edge = useLabStore((s) => s.edges.find((e) => e.id === s.selectedEdgeId))
  const edges = useLabStore((s) => s.edges)
  const targets = node ? edges.filter((e) => e.source === node.id).map((e) => e.target) : []
  const updateNode = useLabStore((s) => s.updateNodeConfig)
  const updateEdge = useLabStore((s) => s.updateEdgeConfig)
  const removeNode = useLabStore((s) => s.removeNode)
  const removeEdge = useLabStore((s) => s.removeEdge)
  const stats = useLabStore((s) => (node ? s.sim?.stats.nodes[node.id] : undefined))

  if (edge) {
    const cfg = edge.data?.config ?? { latencyMs: 300, lossPct: 0 }
    return (
      <aside className="config" data-testid="config-panel" data-edge-id={edge.id}>
        <Head title="Link" sub={`${edge.source} → ${edge.target}`} />
        {EDGE_FIELDS.map((f) => (
          <FieldInput key={f.key} field={f} value={(cfg as unknown as Record<string, unknown>)[f.key]} onChange={(v) => updateEdge(edge.id, { [f.key]: v })} />
        ))}
        <button className="btn btn--danger config__delete" data-testid="cfg-delete" onClick={() => removeEdge(edge.id)}>
          Remove link
        </button>
      </aside>
    )
  }

  if (!node) return null

  const type = node.type as NodeType
  const cfg = node.data.config as unknown as Record<string, unknown>

  return (
    <aside className="config" data-testid="config-panel" data-node-id={node.id}>
      <Head title={LABEL[type]} sub={node.id} />
      {NODE_FIELDS[type]
        .filter((f) => f.type !== 'weights' || cfg.algorithm === 'weightedRoundRobin')
        .map((f) => (
          <FieldInput key={f.key} field={f} value={cfg[f.key]} targets={targets} onChange={(v) => updateNode(node.id, { [f.key]: v })} />
        ))}
      <StatsBlock s={stats} />
      <button className="btn btn--danger config__delete" data-testid="cfg-delete" onClick={() => removeNode(node.id)}>
        Remove node
      </button>
    </aside>
  )
}
