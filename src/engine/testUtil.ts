import { createEngine, type Engine } from './engine'
import type { Project } from './types'

export function boot(p: Project, tickMs = 50): Engine {
  return createEngine(p, { tickMs })
}

/** Advance sim time by `ms` in fixed ticks. */
export function run(e: Engine, ms: number, tick = 50) {
  for (let t = 0; t < ms; t += tick) e.step(tick)
  return e.getState()
}
