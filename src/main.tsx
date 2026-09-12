import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAutosave } from './persistence/autosave'
import { useLabStore } from './store/useLabStore'

initAutosave()
if (import.meta.env.DEV) (window as unknown as { __lab: typeof useLabStore }).__lab = useLabStore

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
