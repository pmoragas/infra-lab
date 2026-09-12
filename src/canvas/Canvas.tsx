import { useCallback, type DragEvent } from 'react'
import { ReactFlow, Background, useReactFlow } from '@xyflow/react'
import { useLabStore } from '../store/useLabStore'
import { LabNode } from './nodes/LabNode'
import { PacketLayer } from './PacketLayer'
import type { NodeType } from '../engine/types'

const nodeTypes = { world: LabNode, lb: LabNode, server: LabNode }

export const DRAG_MIME = 'application/x-infra-lab-node'

export function Canvas() {
  const nodes = useLabStore((s) => s.nodes)
  const edges = useLabStore((s) => s.edges)
  const onNodesChange = useLabStore((s) => s.onNodesChange)
  const onEdgesChange = useLabStore((s) => s.onEdgesChange)
  const onConnect = useLabStore((s) => s.onConnect)
  const addNode = useLabStore((s) => s.addNode)
  const select = useLabStore((s) => s.select)
  const { screenToFlowPosition } = useReactFlow()

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData(DRAG_MIME) as NodeType
      if (!type) return
      addNode(type, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    },
    [addNode, screenToFlowPosition],
  )

  return (
    <div className="project-area" data-testid="project-area" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => select(n.id)}
        onPaneClick={() => select(null)}
        fitView={false}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background />
        <PacketLayer />
      </ReactFlow>
    </div>
  )
}
