import { toPng, toSvg } from 'html-to-image'
import { getNodesBounds, type Node } from '@xyflow/react'

const PADDING = 40

/** Render the whole graph (not just what is on screen) to a PNG or SVG download. */
export async function exportImage(format: 'png' | 'svg', nodes: Node[], filename: string) {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!viewport || nodes.length === 0) return
  const bounds = getNodesBounds(nodes)
  const width = Math.ceil(bounds.width + PADDING * 2)
  const height = Math.ceil(bounds.height + PADDING * 2)
  const options = {
    width,
    height,
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--paper-2').trim(),
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${PADDING - bounds.x}px, ${PADDING - bounds.y}px) scale(1)`,
    },
  }
  const dataUrl = format === 'png' ? await toPng(viewport, { ...options, pixelRatio: 2 }) : await toSvg(viewport, options)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${filename}.${format}`
  a.click()
}
