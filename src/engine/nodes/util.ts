import type { LabNode, NodeContext, Packet } from '../types'

/** Register this node on the packet's request path. */
export function enter(node: LabNode, packet: Packet) {
  packet.path.push(node.id)
}

interface RrState {
  rr: number
}

/** Forward a request to the node's outgoing targets, round robin. Errors back if there is nowhere to go. */
export function forward(node: LabNode, packet: Packet, ctx: NodeContext, targets = ctx.targets(node.id)) {
  if (targets.length === 0) {
    ctx.stats(node.id).rejected += 1
    ctx.respond(node.id, packet, 'error', 'no-route')
    return
  }
  const st = ctx.state<RrState>(`${node.id}:rr`, () => ({ rr: 0 }))
  const to = targets[st.rr % targets.length]
  st.rr += 1
  const s = ctx.stats(node.id)
  s.out += 1
  s.perTarget[to] = (s.perTarget[to] ?? 0) + 1
  ctx.send(node.id, to, packet)
}

export interface Delayed {
  packet: Packet
  at: number
  action: 'forward' | 'respond'
  status?: 'ok' | 'error'
  error?: string
}

/** Run delayed actions that are due. */
export function flushDelayed(node: LabNode, list: Delayed[], ctx: NodeContext): Delayed[] {
  const due = list.filter((d) => d.at <= ctx.now)
  if (due.length === 0) return list
  for (const d of due) {
    if (d.action === 'forward') forward(node, d.packet, ctx)
    else ctx.respond(node.id, d.packet, d.status, d.error)
  }
  return list.filter((d) => d.at > ctx.now)
}

export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
