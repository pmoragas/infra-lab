import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Canvas } from './canvas/Canvas'
import { Sidebar } from './ui/Sidebar'
import { Toolbar } from './ui/Toolbar'
import { ConfigPanel } from './ui/ConfigPanel'

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="app">
        <Sidebar />
        <main className="main">
          <Toolbar />
          <Canvas />
        </main>
        <ConfigPanel />
      </div>
    </ReactFlowProvider>
  )
}
