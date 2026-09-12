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
    await expect(page.locator('[data-node-id="lb-1"] .lab-node__sub')).toHaveText('leastConnections')

    // Toolbar has no algorithm control at all.
    await expect(page.getByTestId('toolbar').locator('select')).toHaveCount(0)
  })

  test('config change applies live and an added server receives packets mid-run', async ({ page }) => {
    await buildWls(page, 2)
    await page.getByTestId('btn-start').click()
    await expect(page.getByTestId('packet')).not.toHaveCount(0, { timeout: 5000 })

    // Add a third server while running and wire it up.
    await page.getByTestId('palette-server').click()
    await connect(page, 'lb-1', 'server-3')
    await expect(page.locator('[data-testid="packet"][data-to="server-3"]')).not.toHaveCount(0, { timeout: 8000 })
    await expect(page.getByTestId('sim-status')).toHaveText('running')
  })

  test('overloaded server turns red', async ({ page }) => {
    await buildWls(page, 1)
    await page.locator('[data-node-id="server-1"]').click()
    await page.getByTestId('cfg-capacity').fill('1')
    await page.getByTestId('cfg-processing').fill('10000')
    await page.locator('[data-node-id="world-1"]').click()
    await page.getByTestId('cfg-intensity').selectOption('burst')

    await page.getByTestId('btn-start').click()
    await expect(page.locator('[data-node-id="server-1"].lab-node--overloaded')).toHaveCount(1, { timeout: 8000 })
    await expect(page.locator('[data-node-id="server-1"] [data-testid="server-load"]')).toHaveText('100%')
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
