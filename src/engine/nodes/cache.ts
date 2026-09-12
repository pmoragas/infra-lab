import type { CacheConfig, NodeHandler } from '../types'
import { enter, flushDelayed, type Delayed } from './util'

export interface CacheState {
  entries: Map<number, number> // key → expires at; Map order = LRU order
  delayed: Delayed[]
}

export const initCache = (): CacheState => ({ entries: new Map(), delayed: [] })

/** Store a key (used by the cache itself on origin replies, and by servers doing cache-aside). */
export function cachePut(st: CacheState, cfg: CacheConfig, key: number, now: number) {
  st.entries.delete(key)
  st.entries.set(key, now + cfg.ttlMs)
  while (st.entries.size > cfg.maxEntries) st.entries.delete(st.entries.keys().next().value!)
}

/** Shared by Cache and CDN. Hit → answer after latencyMs. Miss → forward to origin if any, else answer 'miss'. */
export const cacheHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as CacheConfig
    const st = ctx.state<CacheState>(node.id, initCache)
    const s = ctx.stats(node.id)

    if (packet.phase === 'response') {
      if (packet.status === 'ok') cachePut(st, cfg, packet.key, ctx.now)
      ctx.respond(node.id, packet)
      return
    }

    enter(node, packet)
    const expires = st.entries.get(packet.key)
    if (expires !== undefined && expires > ctx.now) {
      s.hits += 1
      st.entries.delete(packet.key)
      st.entries.set(packet.key, expires) // refresh LRU position
      st.delayed.push({ packet, at: ctx.now + cfg.latencyMs, action: 'respond', status: 'ok' })
      return
    }
    s.misses += 1
    if (expires !== undefined) st.entries.delete(packet.key)
    if (ctx.targets(node.id).length > 0) st.delayed.push({ packet, at: ctx.now + cfg.latencyMs, action: 'forward' })
    else st.delayed.push({ packet, at: ctx.now + cfg.latencyMs, action: 'respond', status: 'error', error: 'miss' })
  },
  tick(node, _dt, ctx) {
    const st = ctx.state<CacheState>(node.id, initCache)
    st.delayed = flushDelayed(node, st.delayed, ctx)
    const s = ctx.stats(node.id)
    s.active = st.entries.size
    const total = s.hits + s.misses
    s.loadPct = total === 0 ? 0 : Math.round((s.hits / total) * 100) // hit ratio
  },
}
