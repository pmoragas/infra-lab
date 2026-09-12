import { test, expect } from '@playwright/test'
import { buildWls } from './helpers'

test.describe('M3: sidebar + project area', () => {
  test('drag from sidebar drops a node into the project area', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('node-world')).toHaveCount(0)
    await page.getByTestId('palette-world').dragTo(page.getByTestId('project-area'), {
      targetPosition: { x: 200, y: 200 },
    })
    await expect(page.getByTestId('node-world')).toHaveCount(1)
  })

  test('build World → LB → 2 Servers and connect them', async ({ page }) => {
    await buildWls(page, 2)
    await expect(page.getByTestId('node-server')).toHaveCount(2)
    await expect(page.locator('.react-flow__edge')).toHaveCount(3)
  })
})
