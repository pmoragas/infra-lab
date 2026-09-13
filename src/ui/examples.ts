/// <reference types="vite/client" />
import type { Project } from '../engine/types'

const modules = import.meta.glob<Project>('../../examples/*.json', { eager: true, import: 'default' })

/** Bundled examples: full systems first, then lessons (presets with a guide), each group by name. */
export const EXAMPLES: Project[] = Object.values(modules).sort(
  (a, b) => Number(!!a.guide) - Number(!!b.guide) || a.name.localeCompare(b.name),
)
