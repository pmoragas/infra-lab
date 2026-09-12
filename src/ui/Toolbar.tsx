import { useRef, type ChangeEvent } from 'react'
import { useLabStore } from '../store/useLabStore'
import { sim } from '../sim/controller'
import { exportJson, importJson } from '../persistence/storage'

export function Toolbar() {
  const status = useLabStore((s) => s.sim?.status ?? 'idle')
  const packets = useLabStore((s) => s.sim?.packets.length ?? 0)
  const nodeCount = useLabStore((s) => s.nodes.length)
  const settings = useLabStore((s) => s.settings)
  const updateSettings = useLabStore((s) => s.updateSettings)
  const fileInput = useRef<HTMLInputElement>(null)

  const onExport = () => {
    const json = exportJson(useLabStore.getState().toProject())
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${useLabStore.getState().name || 'infra-lab'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      sim.reset()
      useLabStore.getState().loadProject(importJson(await file.text()))
    } catch (err) {
      alert((err as Error).message)
    }
  }

  return (
    <div className="toolbar" data-testid="toolbar">
      {status === 'running' ? (
        <button data-testid="btn-pause" onClick={sim.pause}>
          ❚❚ Pause
        </button>
      ) : (
        <button data-testid="btn-start" onClick={sim.start} disabled={nodeCount === 0}>
          ▶ Start
        </button>
      )}
      <button data-testid="btn-reset" onClick={sim.reset} disabled={status === 'idle'}>
        ↺ Reset
      </button>
      <span className="toolbar__status" data-testid="sim-status">
        {status}
      </span>
      <span className="toolbar__packets" data-testid="packet-count">
        {packets} packets
      </span>
      <label className="toolbar__field">
        Speed
        <select data-testid="cfg-speed" value={settings.speed} onChange={(e) => updateSettings({ speed: Number(e.target.value) })}>
          {[0.25, 0.5, 1, 2, 4].map((v) => (
            <option key={v} value={v}>
              {v}x
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar__field">
        Seed
        <input
          data-testid="cfg-seed"
          type="number"
          value={settings.seed}
          disabled={status !== 'idle'}
          onChange={(e) => updateSettings({ seed: Number(e.target.value) || 0 })}
        />
      </label>
      <span className="toolbar__spacer" />
      <button data-testid="btn-export" onClick={onExport} disabled={nodeCount === 0}>
        Export
      </button>
      <button data-testid="btn-import" onClick={() => fileInput.current?.click()}>
        Import
      </button>
      <input ref={fileInput} type="file" accept="application/json" hidden onChange={onImport} data-testid="import-file" />
    </div>
  )
}
