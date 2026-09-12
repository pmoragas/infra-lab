import { useLabStore } from '../store/useLabStore'
import { loadProject, saveProject } from './storage'

/** Hydrate the store from localStorage and save on every graph change (debounced). */
export function initAutosave(debounceMs = 300) {
  const saved = loadProject()
  if (saved) useLabStore.getState().loadProject(saved)

  let timer: ReturnType<typeof setTimeout> | undefined
  return useLabStore.subscribe((next, prev) => {
    if (next.nodes === prev.nodes && next.edges === prev.edges && next.name === prev.name) return
    clearTimeout(timer)
    timer = setTimeout(() => saveProject(next.toProject()), debounceMs)
  })
}
