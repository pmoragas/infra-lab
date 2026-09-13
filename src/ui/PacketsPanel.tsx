import { useLabStore, type LabFlowNode } from '../store/useLabStore'
import { sim } from '../sim/controller'
import { LABEL } from '../engine/defaults'
import type { Journey } from '../engine/types'

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}

const ms = (v: number | undefined) => (v === undefined ? '–' : `${Math.round(v)} ms`)
const latency = (j: Journey) => (j.endedAt ?? j.startedAt) - j.startedAt

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="tile">
      <div className="tile__value" data-testid={testId}>
        {value}
      </div>
      <div className="tile__label">{label}</div>
    </div>
  )
}

function Overview({ journeys, onOpen }: { journeys: Journey[]; onOpen: (id: string) => void }) {
  const global = useLabStore((s) => s.sim?.stats.global)
  const okLatencies = journeys
    .filter((j) => j.outcome === 'ok')
    .map(latency)
    .sort((a, b) => a - b)
  const total = global ? global.ok + global.error + global.timeout : 0
  const failed = global ? global.error + global.timeout : 0

  return (
    <>
      <div className="tiles">
        <Tile label="p50 latency" value={ms(percentile(okLatencies, 50))} testId="stat-p50" />
        <Tile label="p95 latency" value={ms(percentile(okLatencies, 95))} testId="stat-p95" />
        <Tile label="p99 latency" value={ms(percentile(okLatencies, 99))} testId="stat-p99" />
        <Tile label="success" value={total ? `${Math.round((global!.ok / total) * 100)}%` : '–'} testId="stat-success" />
        <Tile label="completed" value={String(total)} testId="stat-completed" />
        <Tile label="failed" value={String(failed)} testId="stat-failed" />
      </div>
      <div className="eyebrow">Recent</div>
      {journeys.length === 0 ? (
        <p className="drawer__empty">Run the simulation. Completed requests show up here; click one, or a moving packet, to follow it.</p>
      ) : (
        <table className="journeys">
          <thead>
            <tr>
              <th>Packet</th>
              <th>Latency</th>
              <th>Hops</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {[...journeys]
              .reverse()
              .slice(0, 50)
              .map((j) => (
                <tr key={j.id} data-testid="journey-row" onClick={() => onOpen(j.id)}>
                  <td>{j.id}</td>
                  <td>{ms(latency(j))}</td>
                  <td>{j.hops.length - 1}</td>
                  <td className={j.outcome === 'ok' ? '' : 'is-warn'}>{j.outcome}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function Timeline({ id, journey, nodes, onBack }: { id: string; journey: Journey | undefined; nodes: LabFlowNode[]; onBack: () => void }) {
  const label = (nodeId: string) => {
    const n = nodes.find((x) => x.id === nodeId)
    return n ? LABEL[n.type as keyof typeof LABEL] : nodeId
  }
  return (
    <div className="journey" data-testid="journey-timeline">
      <button className="btn drawer__back" data-testid="journey-back" onClick={onBack}>
        ← All packets
      </button>
      {!journey ? (
        <p className="drawer__empty">Packet {id} is no longer tracked.</p>
      ) : (
        <>
          <div className="journey__title">
            {journey.id}
            <span>{journey.outcome ?? 'in flight'}</span>
          </div>
          <div className="journey__meta">
            client {journey.clientId} · key {journey.key}
            {journey.endedAt !== undefined ? ` · ${ms(latency(journey))}` : ''}
          </div>
          <ol className="timeline">
            {journey.hops.map((h, i) => (
              <li key={i} data-testid="journey-hop" className={`timeline__hop${h.lost ? ' timeline__hop--lost' : ''}`}>
                <span className="timeline__time">+{Math.round(h.at - journey.startedAt)} ms</span>
                <span className="timeline__dir">{h.phase === 'request' ? '→' : '←'}</span>
                <span className="timeline__node">
                  {label(h.node)} <span className="timeline__id">{h.node}</span>
                </span>
                {h.lost && <span className="timeline__note">lost on link</span>}
              </li>
            ))}
            {journey.outcome && (
              <li className={`timeline__end${journey.outcome === 'ok' ? '' : ' timeline__end--warn'}`}>
                {journey.outcome === 'ok' ? 'Completed' : `Failed: ${journey.outcome}`}
              </li>
            )}
          </ol>
        </>
      )}
    </div>
  )
}

export function PacketsPanel() {
  const journeys = useLabStore((s) => s.sim?.journeys) ?? []
  const journeyId = useLabStore((s) => s.journeyId)
  const nodes = useLabStore((s) => s.nodes)
  const { openJourney, openPanel } = useLabStore.getState()
  // Re-read every tick so an in-flight journey keeps growing.
  useLabStore((s) => s.sim?.tick)
  const selected = journeyId ? (journeys.find((j) => j.id === journeyId) ?? sim.journey(journeyId)) : undefined

  return (
    <section className="drawer" data-testid="packets-panel">
      <div className="drawer__head">
        <div className="eyebrow">{journeyId ? 'Packet journey' : 'Packets'}</div>
        <button className="btn btn--icon" aria-label="Close" onClick={() => openPanel(null)}>
          ×
        </button>
      </div>
      {journeyId ? (
        <Timeline id={journeyId} journey={selected} nodes={nodes} onBack={() => openJourney(null)} />
      ) : (
        <Overview journeys={journeys} onOpen={openJourney} />
      )}
    </section>
  )
}
