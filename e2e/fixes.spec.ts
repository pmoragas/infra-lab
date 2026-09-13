import { test, expect } from '@playwright/test'
import { buildWls } from './helpers'

test.describe('M11: chaos events are visible', () => {
  test('a scheduled kill shows a banner and a tag on the component', async ({ page }) => {
    await buildWls(page, 1)
    await page.getByTestId('btn-chaos').click()
    await page.getByTestId('chaos-kind').selectOption('kill')
    await page.getByTestId('chaos-target').selectOption('server-1')
    await page.getByTestId('chaos-at').fill('1')
    await page.getByTestId('chaos-duration').fill('30')
    await page.getByTestId('chaos-add').click()
    await page.getByTestId('btn-chaos').click()

    await page.getByTestId('btn-start').click()
    await expect(page.getByTestId('chaos-banner')).toContainText('server-1 is down', { timeout: 8000 })
    await expect(page.locator('[data-node-id="server-1"] .lab-node__tag')).toContainText('down')
  })

  test('a fast-run column lists the failures that happened in it', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('btn-examples').click()
    await page.getByTestId('example-lesson-rate-limiter').click()
    await page.getByTestId('guide').waitFor()
    await page.getByTestId('btn-fast').click()
    await expect(page.getByTestId('compare')).toContainText('spike world-1 15–30 s')
    await expect(page.getByTestId('tiles-caption')).toHaveText('Whole run · 0–60 s')
  })
})

test.describe('M11: explain routing', () => {
  test('the inspector explains a component, and a server’s links show the order it uses them', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('btn-examples').click()
    await page.getByTestId('example-lesson-cache').click()
    await expect(page.locator('.react-flow__edge-text')).toHaveCount(2)
    await expect(page.locator('.react-flow__edges')).toContainText('① cache')
    await expect(page.locator('.react-flow__edges')).toContainText('② on miss')

    await page.locator('[data-node-id="server-1"]').click()
    await expect(page.getByTestId('explain')).toContainText('Asks a linked Cache or CDN first')
  })
})
