import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useLabStore } from '../store/useLabStore'
import { exportJson, importJson } from '../persistence/storage'
import { createProject, deleteCurrentProject, importProject, openProject } from '../persistence/autosave'
import { listProjects } from '../persistence/projects'
import { shareUrl } from '../persistence/share'
import { exportImage } from './exportImage'

type Theme = 'light' | 'dark'
const THEME_KEY = 'infra-lab:theme'

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Button with a dropdown; the list is built when it opens so it always reflects current data. */
function Menu({
  label,
  title,
  testId,
  align,
  disabled,
  children,
}: {
  label: string
  title?: string
  testId: string
  align: 'left' | 'right'
  disabled?: boolean
  children: () => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button className="btn" title={title} data-testid={testId} aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className={`menu__list menu__list--${align}`} role="menu" onClick={() => setOpen(false)}>
          {children()}
        </div>
      )}
    </div>
  )
}

export function Header() {
  const name = useLabStore((s) => s.name)
  const projectId = useLabStore((s) => s.projectId)
  const nodeCount = useLabStore((s) => s.nodes.length)
  const canUndo = useLabStore((s) => s.past.length > 0)
  const canRedo = useLabStore((s) => s.future.length > 0)
  const { setName, undo, redo } = useLabStore.getState()
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [copied, setCopied] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('lab-dark', theme === 'dark')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // storage blocked: theme just won't persist
    }
  }, [theme])

  const filename = name.trim() || 'infra-lab'

  const onExportJson = () => {
    const url = URL.createObjectURL(new Blob([exportJson(useLabStore.getState().toProject())], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onExportImage = (format: 'png' | 'svg') => {
    exportImage(format, useLabStore.getState().nodes, filename).catch((err: Error) => alert(`Export failed: ${err.message}`))
  }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      importProject(importJson(await file.text()))
    } catch (err) {
      alert((err as Error).message)
    }
  }

  const onShare = async () => {
    const url = await shareUrl(useLabStore.getState().toProject())
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      prompt('Copy this link', url)
    }
  }

  const onDelete = () => {
    if (confirm(`Delete "${name}"? This cannot be undone.`)) deleteCurrentProject()
  }

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__dot" />
        <span className="header__path">
          infra-lab<span className="header__sep"> /</span>
        </span>
        <input
          className="header__name"
          data-testid="project-name"
          aria-label="Project name"
          value={name}
          size={Math.max(8, name.length + 1)}
          onChange={(e) => setName(e.target.value)}
        />
        <Menu label="▾" title="Projects" testId="btn-projects" align="left">
          {() => (
            <>
              {listProjects().map((m) => (
                <button
                  key={m.id}
                  role="menuitem"
                  className={`menu__item${m.id === projectId ? ' menu__item--current' : ''}`}
                  data-testid="project-item"
                  onClick={() => openProject(m.id)}
                >
                  {m.id === projectId ? name : m.name}
                </button>
              ))}
              <div className="menu__sep" />
              <button role="menuitem" className="menu__item" data-testid="btn-new-project" onClick={createProject}>
                New project
              </button>
              <button role="menuitem" className="menu__item menu__item--danger" data-testid="btn-delete-project" onClick={onDelete}>
                Delete this project
              </button>
            </>
          )}
        </Menu>
      </div>
      <div className="header__actions">
        <button className="btn btn--icon" title="Undo (Ctrl+Z)" data-testid="btn-undo" disabled={!canUndo} onClick={undo}>
          ↶
        </button>
        <button className="btn btn--icon" title="Redo (Ctrl+Shift+Z)" data-testid="btn-redo" disabled={!canRedo} onClick={redo}>
          ↷
        </button>
        <span className="header__divider" />
        <button
          className="btn btn--icon"
          title="Toggle theme"
          data-testid="btn-theme"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <span className="header__divider" />
        <button className="btn" data-testid="btn-share" disabled={nodeCount === 0} onClick={() => void onShare()}>
          {copied ? 'Link copied' : 'Share'}
        </button>
        <Menu label="Export ▾" testId="btn-export" align="right" disabled={nodeCount === 0}>
          {() => (
            <>
              <button role="menuitem" className="menu__item" data-testid="export-json" onClick={onExportJson}>
                Project (JSON)
              </button>
              <button role="menuitem" className="menu__item" data-testid="export-png" onClick={() => onExportImage('png')}>
                Image (PNG)
              </button>
              <button role="menuitem" className="menu__item" data-testid="export-svg" onClick={() => onExportImage('svg')}>
                Image (SVG)
              </button>
            </>
          )}
        </Menu>
        <button className="btn" data-testid="btn-import" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <input ref={fileInput} type="file" accept="application/json" hidden onChange={onImport} data-testid="import-file" />
      </div>
    </header>
  )
}
