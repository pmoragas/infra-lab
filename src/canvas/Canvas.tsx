import { useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react'
import { ReactFlow, Background, BackgroundVariant, useNodesInitialized, useReactFlow } from '@xyflow/react'
import { useLabStore } from '../store/useLabStore'
import { LabNode } from './nodes/LabNode'
import { PacketLayer } from './PacketLayer'
import type { NodeType } from '../engine/types'
import { LABEL } from '../engine/defaults'

const nodeTypes = Object.fromEntries(Object.keys(LABEL).map((t) => [t, LabNode])) as Record<NodeType, typeof LabNode>

export const DRAG_MIME = 'application/x-infra-lab-node'

export function Canvas() {
  const nodes = useLabStore((s) => s.nodes)
  const edges = useLabStore((s) => s.edges)
  const fitRequest = useLabStore((s) => s.fitRequest)
  const cutKey = useLabStore((s) => (s.sim?.chaos.cut ?? []).join(','))
  const onNodesChange = useLabStore((s) => s.onNodesChange)
  const onEdgesChange = useLabStore((s) => s.onEdgesChange)
  const onConnect = useLabStore((s) => s.onConnect)
  const addNode = useLabStore((s) => s.addNode)
  const select = useLabStore((s) => s.select)
  const selectEdge = useLabStore((s) => s.selectEdge)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const initialized = useNodesInitialized()
  const fittedFor = useRef(0)

  // Fit once per loaded project, after its nodes are measured; never on later edits.
  useEffect(() => {
    if (fittedFor.current === fitRequest) return
    if (nodes.length === 0) {
      fittedFor.current = fitRequest
      return
    }
    if (!initialized) return
    fittedFor.current = fitRequest
    void fitView({ padding: 0.12, maxZoom: 1 })
  }, [fitRequest, initialized, nodes.length, fitView])

  const shownEdges = useMemo(() => {
    const cut = new Set(cutKey ? cutKey.split(',') : [])
    return edges.map((e) => (cut.has(e.id) || e.data?.config.down ? { ...e, className: 'edge--cut' } : e))
  }, [edges, cutKey])

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
        edges={shownEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => select(n.id)}
        onEdgeClick={(_, e) => selectEdge(e.id)}
        onPaneClick={() => {
          select(null)
          selectEdge(null)
        }}
        defaultEdgeOptions={{ interactionWidth: 24 }}
        fitView={false}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background variant={BackgroundVariant.Lines} gap={28} />
        <PacketLayer />
      </ReactFlow>
    </div>
  )
}
