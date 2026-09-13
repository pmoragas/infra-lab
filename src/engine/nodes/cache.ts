import type { CacheConfig, NodeHandler, Packet } from '../types'
import { enter, flushDelayed, type Delayed } from './util'

export interface CacheState {
  entries: Map<number | string, number> // key → expires at; Map order = LRU order
  delayed: Delayed[]
}

export const initCache = (): CacheState => ({ entries: new Map(), delayed: [] })

/** The same key on two routes is two different things (GET /products/42 vs GET /reviews/42). */
export const cacheKey = (packet: Packet): number | string => (packet.route ? `${packet.route}:${packet.key}` : packet.key)

/** Store a key (used by the cache itself on origin replies, and by servers doing cache-aside). */
export function cachePut(st: CacheState, cfg: CacheConfig, key: number | string, now: number) {
  st.entries.delete(key)
  st.entries.set(key, now + cfg.ttlMs)
  while (st.entries.size > cfg.maxEntries) st.entries.delete(st.entries.keys().next().value!)
}

/** Shared by Cache and CDN. Hit → answer after latencyMs. Miss → forward to origin if any, else answer 'miss'. Writes pass through. */
export const cacheHandler: NodeHandler = {
  onPacket(node, packet, ctx) {
    const cfg = node.config as CacheConfig
    const st = ctx.state<CacheState>(node.id, initCache)
    const s = ctx.stats(node.id)
    const write = ctx.routeKind(packet.route) === 'write'

    if (packet.phase === 'response') {
      if (packet.status === 'ok' && !write) cachePut(st, cfg, cacheKey(packet), ctx.now)
      ctx.respond(node.id, packet)
      return
    }

    enter(node, packet)
    const at = ctx.now + cfg.latencyMs
    const onward: Delayed =
      ctx.targetsFor(node.id, packet.route).length > 0
        ? { packet, at, action: 'forward' }
        : { packet, at, action: 'respond', status: 'error', error: 'miss' }
    if (write) {
      st.delayed.push(onward) // never served from the cache
      return
    }
    const key = cacheKey(packet)
    const expires = st.entries.get(key)
    if (expires !== undefined && expires > ctx.now) {
      s.hits += 1
      st.entries.delete(key)
      st.entries.set(key, expires) // refresh LRU position
      st.delayed.push({ packet, at, action: 'respond', status: 'ok' })
      return
    }
    s.misses += 1
    if (expires !== undefined) st.entries.delete(key)
    st.delayed.push(onward)
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
