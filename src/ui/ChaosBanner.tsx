import { useLabStore } from '../store/useLabStore'
import { describeEvent } from './chaosEvents'

const SHOW_MS = 5000 // of sim time

/** While running live, recent scheduled failures appear above the run bar; clicking one selects its target. */
export function ChaosBanner() {
  const sim = useLabStore((s) => s.sim)
  const { select, selectEdge } = useLabStore.getState()
  if (!sim || sim.status !== 'running') return null
  const recent = sim.events.filter((e) => sim.now - e.atMs < SHOW_MS).slice(-3)
  if (recent.length === 0) return null

  return (
    <div className="chaos-banner" data-testid="chaos-banner" role="status">
      {recent.map((e) => (
        <button
          key={`${e.failureId}-${e.phase}-${e.atMs}`}
          className="chaos-banner__item"
          onClick={() => (e.kind === 'partition' ? selectEdge(e.target) : select(e.target))}
        >
          <span className="chaos-banner__time">{Math.round(e.atMs / 1000)} s</span>⚡ {describeEvent(e)}
        </button>
      ))}
    </div>
  )
}
