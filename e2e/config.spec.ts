import { test, expect } from '@playwright/test'
import { buildWls, connect } from './helpers'

test.describe('M5: per-component config', () => {
  test('clicking the LB opens its panel and switching algorithm updates that node only', async ({ page }) => {
    await buildWls(page, 2)
    await expect(page.getByTestId('config-panel')).toHaveCount(0)

    await page.locator('[data-node-id="lb-1"]').click()
    const panel = page.getByTestId('config-panel')
    await expect(panel).toHaveAttribute('data-node-id', 'lb-1')
    await panel.getByTestId('cfg-algorithm').selectOption('leastConnections')
    await expect(page.locator('[data-node-id="lb-1"] .lab-node__sub')).toContainText('leastConnections')

    // Toolbar has no algorithm control at all.
    await expect(page.getByTestId('toolbar').getByTestId('cfg-algorithm')).toHaveCount(0)
  })

  test('config change applies live and an added server receives packets mid-run', async ({ page }) => {
    await buildWls(page, 2)
    await page.getByTestId('btn-start').click()
    await expect(page.getByTestId('packet')).not.toHaveCount(0, { timeout: 5000 })

    await page.getByTestId('palette-server').click()
    await connect(page, 'lb-1', 'server-3')
    await expect
      .poll(() => page.evaluate(() => (window as any).__lab.getState().sim?.stats.nodes['lb-1']?.perTarget['server-3'] ?? 0), {
        timeout: 8000,
      })
      .toBeGreaterThan(0)
    await expect(page.getByTestId('sim-status')).toHaveText('running')
  })

  test('overloaded server turns red', async ({ page }) => {
    await buildWls(page, 1)
    await page.locator('[data-node-id="server-1"]').click()
    await page.getByTestId('cfg-capacity').fill('1')
    await page.getByTestId('cfg-processingMs').fill('10000')
    await page.locator('[data-node-id="world-1"]').click()
    await page.getByTestId('cfg-rps').fill('20')

    await page.getByTestId('btn-start').click()
    await expect(page.locator('[data-node-id="server-1"].lab-node--overloaded')).toHaveCount(1, { timeout: 8000 })
    await expect(page.locator('[data-node-id="server-1"] [data-testid="node-stat"]')).toContainText('100%')
  })

  test('delete from the panel removes the node and its edges', async ({ page }) => {
    await buildWls(page, 2)
    await page.locator('[data-node-id="server-2"]').click()
    await page.getByTestId('cfg-delete').click()
    await expect(page.getByTestId('node-server')).toHaveCount(1)
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)
    await expect(page.getByTestId('config-panel')).toHaveCount(0)
  })
})

test.describe('M7: more components + granular config', () => {
  test('sidebar lists all 13 components in groups', async ({ page }) => {
    await page.goto('/')
    for (const t of ['world', 'dns', 'cdn', 'apiGateway', 'rateLimiter', 'lb', 'circuitBreaker', 'server', 'consumer', 'cache', 'database', 'queue', 'thirdParty']) {
      await expect(page.getByTestId(`palette-${t}`)).toHaveCount(1)
    }
  })

  test('World → Rate Limiter → Server: rejected packets come back red', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('palette-world').click()
    await page.getByTestId('palette-rateLimiter').click()
    await page.getByTestId('palette-server').click()
    await connect(page, 'world-1', 'rateLimiter-1')
    await connect(page, 'rateLimiter-1', 'server-1')

    await page.locator('[data-node-id="world-1"]').click()
    await page.getByTestId('cfg-rps').fill('20')
    await page.locator('[data-node-id="rateLimiter-1"]').click()
    await page.getByTestId('cfg-ratePerSec').fill('2')
    await page.getByTestId('cfg-burst').fill('2')

    await page.getByTestId('btn-start').click()
    await expect(page.locator('[data-testid="packet"][data-status="error"]')).not.toHaveCount(0, { timeout: 8000 })
    await expect(page.locator('[data-node-id="rateLimiter-1"] [data-testid="node-stat"]')).not.toContainText('0 rejected')
  })

  test('cache-aside: Server → Cache + Database; cache hit ratio climbs', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('palette-world').click()
    await page.getByTestId('palette-server').click()
    await page.getByTestId('palette-cache').click()
    await page.getByTestId('palette-database').click()
    await connect(page, 'world-1', 'server-1')
    await connect(page, 'server-1', 'cache-1')
    await connect(page, 'server-1', 'database-1')
    await page.locator('[data-node-id="world-1"]').click()
    await page.getByTestId('cfg-keyspace').fill('3')
    await page.getByTestId('cfg-rps').fill('10')

    await page.getByTestId('btn-start').click()
    await expect
      .poll(async () => Number(await page.locator('[data-node-id="cache-1"]').getAttribute('data-load')), { timeout: 10_000 })
      .toBeGreaterThan(50)
  })

  test('link config: click an edge, set loss to 100%, packets stop arriving', async ({ page }) => {
    await buildWls(page, 1)
    await page.locator('.react-flow__edge').first().click({ force: true })
    const panel = page.getByTestId('config-panel')
    await expect(panel).toHaveAttribute('data-edge-id', 'e-world-1-lb-1')
    await panel.getByTestId('cfg-lossPct').fill('100')
    await panel.getByTestId('cfg-latencyMs').fill('100')

    await page.getByTestId('btn-start').click()
    await page.waitForTimeout(3000)
    await expect(page.locator('[data-node-id="lb-1"] [data-testid="node-stat"]')).toHaveCount(1)
    await page.locator('[data-node-id="lb-1"]').click()
    await expect(page.getByTestId('node-stats').locator('[data-stat="in"]')).toHaveCount(0)
  })

  test('speed 4x advances sim time faster; seed is locked while running', async ({ page }) => {
    await buildWls(page, 1)
    await page.getByTestId('cfg-speed').selectOption('4')
    await page.getByTestId('btn-start').click()
    await expect(page.getByTestId('cfg-seed')).toBeDisabled()
    await page.waitForTimeout(1500)
    await page.locator('[data-node-id="world-1"]').click()
    const processed = Number(await page.getByTestId('node-stats').locator('[data-stat="processed"] .config__row-value').textContent())
    expect(processed).toBeGreaterThan(6) // 2 rps × 1.5 s × 4x ≈ 12, minus in-flight
  })

  test('weighted round robin shows one weight input per target', async ({ page }) => {
    await buildWls(page, 3)
    await page.locator('[data-node-id="lb-1"]').click()
    await page.getByTestId('cfg-algorithm').selectOption('weightedRoundRobin')
    for (const s of ['server-1', 'server-2', 'server-3']) await expect(page.getByTestId(`cfg-weight-${s}`)).toHaveCount(1)
    await page.getByTestId('cfg-weight-server-1').fill('5')
    await page.getByTestId('btn-start').click()
    await page.waitForTimeout(3000)
    const n = async (id: string) => {
      const cell = page.getByTestId('node-stats').locator(`[data-stat="to:${id}"] .config__row-value`)
      return (await cell.count()) ? Number(await cell.textContent()) : 0
    }
    expect(await n('server-1')).toBeGreaterThan((await n('server-2')) * 2)
  })
})
