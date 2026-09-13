import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useLabStore } from '../store/useLabStore'
import { sim } from '../sim/controller'
import { exportJson, importJson } from '../persistence/storage'

type Theme = 'light' | 'dark'
const THEME_KEY = 'infra-lab:theme'

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function Header() {
  const name = useLabStore((s) => s.name)
  const nodeCount = useLabStore((s) => s.nodes.length)
  const [theme, setTheme] = useState<Theme>(readTheme)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('lab-dark', theme === 'dark')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // storage blocked: theme just won't persist
    }
  }, [theme])

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
    <header className="header">
      <div className="header__brand">
        <span className="header__dot" />
        <span className="header__path">
          infra-lab<span className="header__sep"> / </span>
          <span className="header__name">{name}</span>
        </span>
      </div>
      <div className="header__actions">
        <button
          className="btn btn--icon"
          title="Toggle theme"
          data-testid="btn-theme"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <span className="header__divider" />
        <button className="btn" data-testid="btn-export" onClick={onExport} disabled={nodeCount === 0}>
          Export
        </button>
        <button className="btn" data-testid="btn-import" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <input ref={fileInput} type="file" accept="application/json" hidden onChange={onImport} data-testid="import-file" />
      </div>
    </header>
  )
}
