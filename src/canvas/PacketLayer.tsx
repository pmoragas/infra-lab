import { ViewportPortal } from '@xyflow/react'
import { useLabStore, type LabFlowNode } from '../store/useLabStore'
import type { Packet } from '../engine/types'

/** Point on the default React Flow bezier (right → left handles) at t ∈ [0,1]. */
function bezierPoint(sx: number, sy: number, tx: number, ty: number, t: number) {
  const distance = tx - sx
  const offset = distance >= 0 ? 0.5 * distance : 0.25 * 25 * Math.sqrt(-distance)
  const c1x = sx + offset
  const c2x = tx - offset
  const u = 1 - t
  const x = u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * tx
  const y = u * u * u * sy + 3 * u * u * t * sy + 3 * u * t * t * ty + t * t * t * ty
  return { x, y }
}

function handlePoints(node: LabFlowNode) {
  const w = node.measured?.width ?? 140
  const h = node.measured?.height ?? 60
  return {
    right: { x: node.position.x + w, y: node.position.y + h / 2 },
    left: { x: node.position.x, y: node.position.y + h / 2 },
  }
}

function packetPosition(p: Packet, byId: Map<string, LabFlowNode>, edgeSource: string | undefined) {
  const from = byId.get(p.from)
  const to = byId.get(p.to)
  if (!from || !to) return null
  // Edge geometry always runs source(right) → target(left); a response walks it backwards.
  const forward = edgeSource === p.from
  const src = forward ? handlePoints(from).right : handlePoints(to).right
  const dst = forward ? handlePoints(to).left : handlePoints(from).left
  const t = forward ? p.progress : 1 - p.progress
  return bezierPoint(src.x, src.y, dst.x, dst.y, t)
}

export function PacketLayer() {
  const packets = useLabStore((s) => s.sim?.packets)
  const nodes = useLabStore((s) => s.nodes)
  const edges = useLabStore((s) => s.edges)
  const journeyId = useLabStore((s) => s.journeyId)
  const openJourney = useLabStore((s) => s.openJourney)
  if (!packets || packets.length === 0) return null

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edgeSource = new Map(edges.map((e) => [e.id, e.source]))

  return (
    <ViewportPortal>
      <svg className="packet-layer" data-testid="packet-layer" style={{ overflow: 'visible', position: 'absolute' }}>
        {packets.map((p) => {
          const pos = packetPosition(p, byId, edgeSource.get(p.edgeId))
          if (!pos) return null
          return (
            <circle
              key={p.id}
              className={`packet nopan packet--${p.phase}${p.status === 'error' ? ' packet--error' : ''}${p.id === journeyId ? ' packet--selected' : ''}`}
              data-testid="packet"
              data-phase={p.phase}
              data-status={p.status}
              data-to={p.to}
              cx={pos.x}
              cy={pos.y}
              r={p.id === journeyId ? 7 : 4.5}
              onClick={() => openJourney(p.id)}
            />
          )
        })}
      </svg>
    </ViewportPortal>
  )
}
