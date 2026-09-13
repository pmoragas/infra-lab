import { useLabStore } from '../store/useLabStore'
import { sim } from '../sim/controller'
import { DEFAULT_SETTINGS } from '../engine/defaults'
import type { Project } from '../engine/types'
import { deleteProject, listProjects, loadProject, migrateLegacy, newProjectId, saveProject } from './projects'
import { decodeProject, SHARE_PREFIX } from './share'

const PROJECT_PREFIX = '#/p/'
const DEBOUNCE_MS = 300

let timer: ReturnType<typeof setTimeout> | undefined
let pending: Project | null = null

function flush() {
  clearTimeout(timer)
  if (pending) saveProject(pending)
  pending = null
}

function blankProject(): Project {
  return { id: newProjectId(), name: 'Untitled', nodes: [], edges: [], settings: { ...DEFAULT_SETTINGS }, failures: [] }
}

function firstSaved(): Project | null {
  for (const m of listProjects()) {
    const p = loadProject(m.id)
    if (p) return p
  }
  return null
}

function show(project: Project) {
  flush()
  sim.reset()
  useLabStore.getState().loadProject(project)
  history.replaceState(null, '', `${PROJECT_PREFIX}${project.id}`)
}

/** URL → project: `#/p/<id>` opens a saved project, `#/s/<data>` imports a share link, anything else the last one. */
async function route() {
  const hash = location.hash
  if (hash.startsWith(SHARE_PREFIX)) {
    try {
      const shared = await decodeProject(hash.slice(SHARE_PREFIX.length))
      const project = { ...shared, id: newProjectId() }
      saveProject(project)
      return show(project)
    } catch {
      // broken link: fall back to the last project
    }
  }
  const id = hash.startsWith(PROJECT_PREFIX) ? hash.slice(PROJECT_PREFIX.length) : ''
  if (id && id === useLabStore.getState().projectId) return
  let project = (id && loadProject(id)) || firstSaved()
  if (!project) {
    project = blankProject()
    saveProject(project)
  }
  show(project)
}

export function openProject(id: string) {
  flush()
  location.hash = `${PROJECT_PREFIX}${id}`
}

export function createProject() {
  const project = blankProject()
  saveProject(project)
  openProject(project.id)
}

/** Imported files always become a new project, so they never overwrite an existing one. */
export function importProject(project: Project) {
  const copy = { ...project, id: newProjectId() }
  saveProject(copy)
  openProject(copy.id)
}

export function deleteCurrentProject() {
  clearTimeout(timer)
  pending = null
  deleteProject(useLabStore.getState().projectId)
  const next = firstSaved()
  if (next) openProject(next.id)
  else createProject()
}

/** Load the project named in the URL, then save every change to it (debounced). */
export async function initSession() {
  migrateLegacy()
  useLabStore.subscribe((next, prev) => {
    if (
      next.nodes === prev.nodes &&
      next.edges === prev.edges &&
      next.name === prev.name &&
      next.settings === prev.settings &&
      next.failures === prev.failures
    ) {
      return
    }
    pending = next.toProject()
    clearTimeout(timer)
    timer = setTimeout(flush, DEBOUNCE_MS)
  })
  window.addEventListener('hashchange', () => void route())
  await route()
}
