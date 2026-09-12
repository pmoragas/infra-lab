import { test, expect } from '@playwright/test'
import { buildWls } from './helpers'

test.describe('M4: simulation on canvas', () => {
  test('start shows packets, pause freezes them, reset clears', async ({ page }) => {
    await buildWls(page, 2)
    await expect(page.getByTestId('sim-status')).toHaveText('idle')

    await page.getByTestId('btn-start').click()
    await expect(page.getByTestId('sim-status')).toHaveText('running')
    await expect(page.getByTestId('packet')).not.toHaveCount(0, { timeout: 5000 })

    await page.getByTestId('btn-pause').click()
    await expect(page.getByTestId('sim-status')).toHaveText('paused')
    const before = await page.getByTestId('packet').evaluateAll((els) => els.map((e) => e.getAttribute('cx')))
    await page.waitForTimeout(400)
    const after = await page.getByTestId('packet').evaluateAll((els) => els.map((e) => e.getAttribute('cx')))
    expect(after).toEqual(before)

    await page.getByTestId('btn-reset').click()
    await expect(page.getByTestId('sim-status')).toHaveText('idle')
    await expect(page.getByTestId('packet')).toHaveCount(0)
  })

  test('both servers receive traffic and report load', async ({ page }) => {
    await buildWls(page, 2)
    await page.getByTestId('btn-start').click()
    await expect(page.getByTestId('packet').and(page.locator('[data-phase="response"]'))).not.toHaveCount(0, {
      timeout: 8000,
    })
    const loads = page.getByTestId('server-load')
    await expect(loads).toHaveCount(2)
  })
})
