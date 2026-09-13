import { useLabStore } from '../store/useLabStore'
import { sim } from '../sim/controller'

export function Toolbar() {
  const status = useLabStore((s) => s.sim?.status ?? 'idle')
  const packets = useLabStore((s) => s.sim?.packets.length ?? 0)
  const nodeCount = useLabStore((s) => s.nodes.length)
  const settings = useLabStore((s) => s.settings)
  const updateSettings = useLabStore((s) => s.updateSettings)
  const panel = useLabStore((s) => s.panel)
  const openPanel = useLabStore((s) => s.openPanel)

  return (
    <div className="toolbar" data-testid="toolbar">
      {status === 'running' ? (
        <button className="btn btn--primary" data-testid="btn-pause" onClick={sim.pause}>
          ❙❙&nbsp; Pause
        </button>
      ) : (
        <button className="btn btn--primary" data-testid="btn-start" onClick={sim.start} disabled={nodeCount === 0}>
          ▶&nbsp; Run
        </button>
      )}
      <button className="btn" data-testid="btn-reset" onClick={sim.reset} disabled={status === 'idle'}>
        Reset
      </button>
      <button
        className="btn"
        data-testid="btn-fast"
        title="Simulate the next 60 seconds instantly, then pause on the results"
        onClick={() => sim.fastForward(60_000)}
        disabled={nodeCount === 0}
      >
        ⏩ 60 s
      </button>
      <span className="toolbar__divider" />
      <label className="toolbar__field">
        <span className="toolbar__label">Speed</span>
        <select data-testid="cfg-speed" value={settings.speed} onChange={(e) => updateSettings({ speed: Number(e.target.value) })}>
          {[0.25, 0.5, 1, 2, 4].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar__field">
        <span className="toolbar__label">Seed</span>
        <input
          data-testid="cfg-seed"
          type="number"
          value={settings.seed}
          disabled={status !== 'idle'}
          onChange={(e) => updateSettings({ seed: Number(e.target.value) || 0 })}
        />
      </label>
      <span className="toolbar__divider" />
      <button
        className={`btn${panel === 'packets' ? ' btn--active' : ''}`}
        data-testid="btn-packets"
        onClick={() => openPanel(panel === 'packets' ? null : 'packets')}
      >
        Packets
      </button>
      <button
        className={`btn${panel === 'chaos' ? ' btn--active' : ''}`}
        data-testid="btn-chaos"
        onClick={() => openPanel(panel === 'chaos' ? null : 'chaos')}
      >
        Chaos
      </button>
      <span className="toolbar__divider" />
      <div className="toolbar__live">
        <span className={`toolbar__dot${status === 'running' ? ' toolbar__dot--running' : ''}`} />
        <span className="toolbar__status" data-testid="sim-status">
          {status}
        </span>
        <span className="toolbar__count" data-testid="packet-count">
          {packets}
        </span>
        <span className="toolbar__unit">packets</span>
      </div>
    </div>
  )
}
