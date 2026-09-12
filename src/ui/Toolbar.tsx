import { useRef, type ChangeEvent } from 'react'
import { useLabStore } from '../store/useLabStore'
import { sim } from '../sim/controller'
import { exportJson, importJson } from '../persistence/storage'

export function Toolbar() {
  const status = useLabStore((s) => s.sim?.status ?? 'idle')
  const packets = useLabStore((s) => s.sim?.packets.length ?? 0)
  const nodeCount = useLabStore((s) => s.nodes.length)
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
