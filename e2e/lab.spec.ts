import { test, expect } from '@playwright/test'
import { buildWls } from './helpers'

test.describe('M10: fast run', () => {
  test('⏩ 60 s simulates a minute instantly, pauses, and shows the results', async ({ page }) => {
    await buildWls(page, 1)
    await page.getByTestId('btn-fast').click()
    await expect(page.getByTestId('sim-status')).toHaveText('paused')
    await expect(page.getByTestId('packets-panel')).toBeVisible()
    await expect(page.getByTestId('stat-p50')).toContainText('ms')
    const completed = Number(await page.getByTestId('stat-completed').textContent())
    expect(completed).toBeGreaterThan(100) // World default 2 rps × 60 s
  })
})

test.describe('M10: compare runs', () => {
  test('each ⏩ 60 s adds a column for just that minute; Save whole run adds one too', async ({ page }) => {
    await buildWls(page, 1)
    await page.getByTestId('btn-fast').click()
    await expect(page.getByTestId('snapshot-col')).toHaveCount(1)
    await page.getByTestId('btn-fast').click()
    await expect(page.getByTestId('snapshot-col')).toHaveCount(2)
    await expect(page.getByTestId('snapshot-label').nth(1)).toHaveValue('Run 2')
    await expect(page.getByTestId('compare')).toContainText('60–120 s')

    await page.getByTestId('btn-snapshot').click()
    await expect(page.getByTestId('snapshot-col')).toHaveCount(3)
    await expect(page.getByTestId('compare')).toContainText('0–120 s')

    await page.getByTestId('snapshot-remove').first().click()
    await expect(page.getByTestId('snapshot-col')).toHaveCount(2)
  })
})

test.describe('M10: examples and lessons', () => {
  test('the empty sheet offers examples, and a lesson opens with its guide', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('empty-state')).toBeVisible()
    await page.getByTestId('empty-example-lesson-health-check').click()
    await expect(page.getByTestId('node-server')).toHaveCount(3)
    await expect(page.getByTestId('empty-state')).toHaveCount(0)
    await expect(page.getByTestId('project-name')).toHaveValue('1. Dead server')
    await expect(page.getByTestId('guide')).toContainText('Does the load balancer notice?')

    await page.getByTestId('guide').getByRole('button').click()
    await expect(page.locator('.guide__steps')).toHaveCount(0)
  })

  test('the Examples menu loads a full system, which has no guide', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('btn-examples').click()
    await page.getByTestId('example-ecommerce').click()
    await expect(page.getByTestId('node-server')).toHaveCount(3)
    await expect(page.getByTestId('guide')).toHaveCount(0)
  })
})
