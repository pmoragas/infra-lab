import { test, expect } from '@playwright/test'
import { buildWls } from './helpers'

test.describe('M12: routes', () => {
  test('define routes, set a World mix, tag a link, and see the route on the link and in the Packets panel', async ({ page }) => {
    await buildWls(page, 2)

    await page.getByTestId('btn-routes').click()
    await page.getByTestId('route-name').fill('GET /products')
    await page.getByTestId('route-add').click()
    await page.getByTestId('route-name').fill('POST /checkout')
    await page.getByTestId('route-kind').selectOption('write')
    await page.getByTestId('route-add').click()
    await expect(page.getByTestId('route-item')).toHaveCount(2)
    await page.getByTestId('btn-routes').click() // close the drawer: it covers the canvas

    await page.locator('[data-node-id="world-1"]').click()
    await page.getByTestId('cfg-mix-get-products').fill('80')
    await page.getByTestId('cfg-mix-post-checkout').fill('20')
    await page.getByTestId('cfg-rps').fill('10')

    await page.locator('.react-flow__edge[data-id="e-lb-1-server-1"]').click({ force: true })
    await expect(page.getByTestId('config-panel')).toHaveAttribute('data-edge-id', 'e-lb-1-server-1')
    await page.getByTestId('cfg-route-get-products').check()
    await expect(page.locator('.react-flow__edges')).toContainText('GET /products')

    await page.getByTestId('btn-packets').click()
    await page.getByTestId('cfg-speed').selectOption('4')
    await page.getByTestId('btn-start').click()
    await expect(page.getByTestId('journey-route').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('journey-route').filter({ hasText: 'GET /products' }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('journey-route').filter({ hasText: 'POST /checkout' }).first()).toBeVisible({ timeout: 10_000 })

    // Checkouts can only go to server-2: its link is untagged, server-1's carries only GET /products.
    await page.waitForTimeout(2000)
    const checkoutsOnServer1 = await page.evaluate(() => {
      const journeys = (window as any).__lab.getState().sim?.journeys ?? []
      return journeys.filter((j: any) => j.route === 'post-checkout' && j.hops.some((h: any) => h.node === 'server-1')).length
    })
    expect(checkoutsOnServer1).toBe(0)
  })
})
