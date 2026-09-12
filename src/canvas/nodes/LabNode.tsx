import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LabFlowNode } from '../../store/useLabStore'
import { useLabStore } from '../../store/useLabStore'
import type { LbConfig, ServerConfig, WorldConfig } from '../../engine/types'

const TITLE = { world: 'World', lb: 'Load Balancer', server: 'Server' } as const

function subtitle(node: LabFlowNode): string {
  const c = node.data.config
  switch (node.type) {
    case 'world':
      return (c as WorldConfig).intensity
    case 'lb':
      return (c as LbConfig).algorithm
    case 'server':
      return `cap ${(c as ServerConfig).capacity} · ${(c as ServerConfig).processingMs}ms`
  }
  return ''
}

export function LabNode(props: NodeProps<LabFlowNode>) {
  const type = props.type as LabFlowNode['type']
  const serverStats = useLabStore((s) => (type === 'server' ? s.sim?.stats.servers[props.id] : undefined))
  const loadPct = serverStats?.loadPct ?? 0
  const overloaded = type === 'server' && loadPct > 80

  return (
    <div
      className={`lab-node lab-node--${type} ${overloaded ? 'lab-node--overloaded' : ''} ${props.selected ? 'lab-node--selected' : ''}`}
      data-testid={`node-${type}`}
      data-node-id={props.id}
      data-load={loadPct}
    >
      {type !== 'world' && <Handle type="target" position={Position.Left} />}
      <div className="lab-node__title">{TITLE[type]}</div>
      <div className="lab-node__sub">{subtitle(props as unknown as LabFlowNode)}</div>
      {type === 'server' && (
        <div className="lab-node__load" data-testid="server-load">
          {loadPct}%
        </div>
      )}
      {type !== 'server' && <Handle type="source" position={Position.Right} />}
    </div>
  )
}
