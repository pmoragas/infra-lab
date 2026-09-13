import type { Project } from '../engine/types'
import { importJson } from './storage'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
}

const INDEX_KEY = 'infra-lab:projects'
const LEGACY_KEY = 'infra-lab:project'
const projectKey = (id: string) => `infra-lab:project:${id}`

export const newProjectId = () => crypto.randomUUID().slice(0, 8)

/** Saved projects, most recently saved first. */
export function listProjects(storage: StorageLike = localStorage): ProjectMeta[] {
  try {
    const list = JSON.parse(storage.getItem(INDEX_KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeIndex(list: ProjectMeta[], storage: StorageLike) {
  storage.setItem(INDEX_KEY, JSON.stringify(list))
}

export function saveProject(project: Project, storage: StorageLike = localStorage, now = Date.now()): void {
  storage.setItem(projectKey(project.id), JSON.stringify(project))
  const rest = listProjects(storage).filter((m) => m.id !== project.id)
  writeIndex([{ id: project.id, name: project.name, updatedAt: now }, ...rest], storage)
}

export function loadProject(id: string, storage: StorageLike = localStorage): Project | null {
  const raw = storage.getItem(projectKey(id))
  if (!raw) return null
  try {
    return importJson(raw)
  } catch {
    return null
  }
}

export function deleteProject(id: string, storage: StorageLike = localStorage): void {
  storage.removeItem(projectKey(id))
  writeIndex(
    listProjects(storage).filter((m) => m.id !== id),
    storage,
  )
}

/** Before multi-project support there was one project under a single key: move it into the list once. */
export function migrateLegacy(storage: StorageLike = localStorage): void {
  const raw = storage.getItem(LEGACY_KEY)
  if (!raw) return
  storage.removeItem(LEGACY_KEY)
  try {
    saveProject(importJson(raw), storage)
  } catch {
    // corrupt leftovers are dropped
  }
}
