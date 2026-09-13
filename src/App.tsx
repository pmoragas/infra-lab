import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Canvas } from './canvas/Canvas'
import { Header } from './ui/Header'
import { Sidebar } from './ui/Sidebar'
import { Toolbar } from './ui/Toolbar'
import { ConfigPanel } from './ui/ConfigPanel'
import { PacketsPanel } from './ui/PacketsPanel'
import { ChaosPanel } from './ui/ChaosPanel'
import { useLabStore } from './store/useLabStore'

function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      const key = e.key.toLowerCase()
      const { undo, redo } = useLabStore.getState()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  const panel = useLabStore((s) => s.panel)
  useUndoShortcuts()

  return (
    <ReactFlowProvider>
      <div className="app">
        <Header />
        <div className="app__body">
          <Sidebar />
          <main className="main">
            <Canvas />
            {panel === 'packets' && <PacketsPanel />}
            {panel === 'chaos' && <ChaosPanel />}
            <Toolbar />
          </main>
          <ConfigPanel />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
