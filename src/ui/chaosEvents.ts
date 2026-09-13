import type { ChaosEvent, FailureKind } from '../engine/types'

const sec = (ms: number) => Math.round(ms / 1000)

const SHORT: Record<FailureKind, string> = { kill: 'kill', partition: 'cut', spike: 'spike', flush: 'flush' }

/** One line for the live banner. */
export function describeEvent(e: ChaosEvent): string {
  const started = e.phase === 'start'
  switch (e.kind) {
    case 'kill':
      return started ? `${e.target} is down` : `${e.target} is back up`
    case 'partition':
      return started ? `link ${e.target} is cut` : `link ${e.target} is restored`
    case 'spike':
      return started ? `traffic spike on ${e.target}` : `traffic spike on ${e.target} ended`
    case 'flush':
      return `cache ${e.target} was flushed`
  }
}

/** One line per failure for a compare column, pairing each start with its end: "spike world-1 15–30 s". */
export function summarizeEvents(events: ChaosEvent[] = []): string[] {
  const byFailure = new Map<string, { kind: FailureKind; target: string; start?: number; end?: number }>()
  for (const e of events) {
    const entry = byFailure.get(e.failureId) ?? { kind: e.kind, target: e.target }
    if (e.phase === 'start') entry.start = e.atMs
    else entry.end = e.atMs
    byFailure.set(e.failureId, entry)
  }
  return [...byFailure.values()].map(({ kind, target, start, end }) => {
    const when =
      kind === 'flush'
        ? `${sec(start!)} s`
        : start !== undefined && end !== undefined
          ? `${sec(start)}–${sec(end)} s`
          : start !== undefined
            ? `from ${sec(start)} s`
            : `until ${sec(end!)} s`
    return `${SHORT[kind]} ${target} ${when}`
  })
}
