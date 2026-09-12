import { createEngine, type Engine } from '../engine/engine'
import { useLabStore, type LabStore } from '../store/useLabStore'

/** Owns the single running engine and bridges it to the store. Lives outside React. */
let engine: Engine | null = null
let unsubscribe: (() => void) | null = null

function ensureEngine(): Engine {
  if (engine) return engine
  const project = useLabStore.getState().toProject()
  engine = createEngine(project)
  unsubscribe = engine.subscribe((s) => useLabStore.getState().setSim(s))
  useLabStore.getState().setSim(engine.getState())
  return engine
}

/** Push graph and config edits into the live engine so they apply mid-run. */
function syncToEngine(next: LabStore, prev: LabStore) {
  if (!engine) return
  if (next.nodes !== prev.nodes) {
    const prevById = new Map(prev.nodes.map((n) => [n.id, n]))
    const nextIds = new Set(next.nodes.map((n) => n.id))
    for (const n of next.nodes) {
      const before = prevById.get(n.id)
      if (!before) {
        engine.addNode({ id: n.id, type: n.type!, position: n.position, config: n.data.config })
      } else if (before.data.config !== n.data.config) {
        engine.updateNodeConfig(n.id, n.data.config)
      }
    }
    for (const id of prevById.keys()) if (!nextIds.has(id)) engine.removeNode(id)
  }
  if (next.edges !== prev.edges) {
    const prevIds = new Set(prev.edges.map((e) => e.id))
    const nextIds = new Set(next.edges.map((e) => e.id))
    for (const e of next.edges) if (!prevIds.has(e.id)) engine.addEdge({ id: e.id, source: e.source, target: e.target })
    for (const id of prevIds) if (!nextIds.has(id)) engine.removeEdge(id)
  }
}

useLabStore.subscribe(syncToEngine)

export const sim = {
  start() {
    ensureEngine().start()
  },
  pause() {
    engine?.pause()
  },
  reset() {
    engine?.reset()
    unsubscribe?.()
    engine = null
    unsubscribe = null
    useLabStore.getState().setSim(null)
  },
  /** The live engine, if any. Used to push graph/config changes while running. */
  get engine() {
    return engine
  },
}
