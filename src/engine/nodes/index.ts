import type { NodeHandler, NodeType } from '../types'
import { worldHandler } from './world'
import { lbHandler } from './lb'
import { serverHandler } from './server'
import { cacheHandler } from './cache'
import { rateLimiterHandler } from './rateLimiter'
import { apiGatewayHandler } from './apiGateway'
import { databaseHandler } from './database'
import { queueHandler } from './queue'
import { consumerHandler } from './consumer'
import { dnsHandler } from './dns'
import { circuitBreakerHandler } from './circuitBreaker'
import { thirdPartyHandler } from './thirdParty'

export const handlers: Record<NodeType, NodeHandler> = {
  world: worldHandler,
  lb: lbHandler,
  server: serverHandler,
  cache: cacheHandler,
  cdn: cacheHandler,
  rateLimiter: rateLimiterHandler,
  apiGateway: apiGatewayHandler,
  database: databaseHandler,
  queue: queueHandler,
  consumer: consumerHandler,
  dns: dnsHandler,
  circuitBreaker: circuitBreakerHandler,
  thirdParty: thirdPartyHandler,
}
