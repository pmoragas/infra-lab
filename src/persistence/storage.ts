import type { Project } from '../engine/types'
import { LABEL } from '../engine/defaults'

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
    typeof p.settings?.seed !== 'number' ||
    (p.failures !== undefined && !Array.isArray(p.failures)) ||
    (p.guide !== undefined && (typeof p.guide?.question !== 'string' || !Array.isArray(p.guide?.steps))) ||
    (p.snapshots !== undefined && !Array.isArray(p.snapshots))
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
