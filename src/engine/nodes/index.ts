import type { NodeHandler, NodeType } from '../types'
import { worldHandler } from './world'
import { lbHandler } from './lb'
import { serverHandler } from './server'

export const handlers: Record<NodeType, NodeHandler> = {
  world: worldHandler,
  lb: lbHandler,
  server: serverHandler,
}
