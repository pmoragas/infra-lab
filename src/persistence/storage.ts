import type { Project } from '../engine/types'
import { LABEL } from '../engine/defaults'

export const STORAGE_KEY = 'infra-lab:project'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function saveProject(project: Project, storage: StorageLike = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(project))
}

export function loadProject(storage: StorageLike = localStorage): Project | null {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return importJson(raw)
  } catch {
    return null
  }
}

export function clearProject(storage: StorageLike = localStorage): void {
  storage.removeItem(STORAGE_KEY)
}

export function exportJson(project: Project): string {
  return JSON.stringify(project, null, 2)
}

/** Parses and shape-checks a project. Throws on anything that is not a project. */
export function importJson(raw: string): Project {
  const p = JSON.parse(raw) as Partial<Project>
  if (
    !p ||
    typeof p.id !== 'string' ||
    typeof p.name !== 'string' ||
    !Array.isArray(p.nodes) ||
    !Array.isArray(p.edges) ||
    typeof p.settings?.seed !== 'number'
  ) {
    throw new Error('Not an Infra Lab project')
  }
  for (const n of p.nodes) {
    if (!(n.type in LABEL) || typeof n.id !== 'string' || !n.position || !n.config) {
      throw new Error(`Invalid node ${JSON.stringify(n)}`)
    }
  }
  for (const e of p.edges) {
    if (typeof e.id !== 'string' || typeof e.source !== 'string' || typeof e.target !== 'string') {
      throw new Error(`Invalid edge ${JSON.stringify(e)}`)
    }
  }
  return p as Project
}
