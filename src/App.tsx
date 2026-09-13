import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Canvas } from './canvas/Canvas'
import { Header } from './ui/Header'
import { Sidebar } from './ui/Sidebar'
import { Toolbar } from './ui/Toolbar'
import { ConfigPanel } from './ui/ConfigPanel'

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="app">
        <Header />
        <div className="app__body">
          <Sidebar />
          <main className="main">
            <Canvas />
            <Toolbar />
          </main>
          <ConfigPanel />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
