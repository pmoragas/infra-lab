import { statSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { buildWls } from './helpers'

test.describe('M9: undo / redo', () => {
  test('undo and redo with the header buttons and the keyboard', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('palette-world').click()
    await page.getByTestId('palette-lb').click()
    await expect(page.getByTestId('node-lb')).toHaveCount(1)
    await page.getByTestId('btn-undo').click()
    await expect(page.getByTestId('node-lb')).toHaveCount(0)
    await page.getByTestId('btn-redo').click()
    await expect(page.getByTestId('node-lb')).toHaveCount(1)
    await page.getByTestId('project-area').click({ position: { x: 600, y: 500 } })
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('node-lb')).toHaveCount(0)
    await page.keyboard.press('Control+Shift+z')
    await expect(page.getByTestId('node-lb')).toHaveCount(1)
  })
})

test.describe('M9: projects, share links, export', () => {
  test('a new project gets its own URL; switching back restores the graph; reload keeps it', async ({ page }) => {
    await buildWls(page, 1)
    await page.getByTestId('project-name').fill('First')
    await page.waitForTimeout(500)
    const firstUrl = page.url()
    expect(firstUrl).toMatch(/#\/p\/\w+/)

    await page.getByTestId('btn-projects').click()
    await page.getByTestId('btn-new-project').click()
    await expect(page.getByTestId('node-server')).toHaveCount(0)
    await expect(page).not.toHaveURL(firstUrl)

    await page.getByTestId('btn-projects').click()
    await page.getByTestId('project-item').filter({ hasText: 'First' }).click()
    await expect(page.getByTestId('node-server')).toHaveCount(1)
    await expect(page.getByTestId('project-name')).toHaveValue('First')

    await page.reload()
    await expect(page.getByTestId('node-server')).toHaveCount(1)
    await expect(page.getByTestId('project-name')).toHaveValue('First')
  })

  test('a share link opens the same graph as a new project', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await buildWls(page, 2)
    await page.getByTestId('btn-share').click()
    await expect(page.getByTestId('btn-share')).toHaveText('Link copied')
    const link = await page.evaluate(() => navigator.clipboard.readText())
    expect(link).toContain('#/s/')

    const other = await context.newPage()
    await other.goto(link)
    await expect(other.getByTestId('node-server')).toHaveCount(2)
    await expect(other.locator('.react-flow__edge')).toHaveCount(3)
    await expect(other).toHaveURL(/#\/p\//)
  })

  test('export downloads PNG and SVG images of the canvas', async ({ page }) => {
    await buildWls(page, 1)
    for (const format of ['png', 'svg']) {
      await page.getByTestId('btn-export').click()
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`export-${format}`).click()])
      expect(download.suggestedFilename()).toBe(`Untitled.${format}`)
      expect(statSync(await download.path()).size).toBeGreaterThan(1000)
    }
  })
})

test.describe('M9: failure injection', () => {
  test('kill a server from the inspector: it shows down and the LB stops sending to it', async ({ page }) => {
    await buildWls(page, 2)
    await page.locator('[data-node-id="server-1"]').click()
    await page.getByTestId('btn-kill').click()
    await expect(page.locator('[data-node-id="server-1"].lab-node--down')).toHaveCount(1)
    await expect(page.getByTestId('btn-kill')).toHaveText('Revive node')

    await page.getByTestId('btn-start').click()
    await page.waitForTimeout(3000)
    await page.locator('[data-node-id="lb-1"]').click()
    await expect(page.getByTestId('node-stats').locator('[data-stat="to:server-2"]')).toHaveCount(1)
    await expect(page.getByTestId('node-stats').locator('[data-stat="to:server-1"]')).toHaveCount(0)
  })

  test('cut a link from the inspector: it renders as cut', async ({ page }) => {
    await buildWls(page, 1)
    await page.locator('.react-flow__edge').first().click({ force: true })
    await page.getByTestId('btn-cut').click()
    await expect(page.locator('.react-flow__edge.edge--cut')).toHaveCount(1)
    await expect(page.getByTestId('btn-cut')).toHaveText('Restore link')
  })

  test('a failure scheduled in the Chaos panel is active while the sim runs', async ({ page }) => {
    await buildWls(page, 1)
    await page.getByTestId('btn-chaos').click()
    await page.getByTestId('chaos-kind').selectOption('kill')
    await page.getByTestId('chaos-target').selectOption('server-1')
    await page.getByTestId('chaos-at').fill('0')
    await page.getByTestId('chaos-duration').fill('30')
    await page.getByTestId('chaos-add').click()
    await expect(page.getByTestId('failure-item')).toHaveCount(1)

    await page.getByTestId('btn-start').click()
    await expect(page.locator('[data-node-id="server-1"].lab-node--down')).toHaveCount(1)
    await expect(page.locator('.chaos__item--active')).toHaveCount(1)
    await page.getByTestId('failure-remove').click()
    await expect(page.getByTestId('failure-item')).toHaveCount(0)
  })
})

test.describe('M9: packet journey', () => {
  test('the packets panel lists completed requests with percentiles; a row opens its hop timeline', async ({ page }) => {
    await buildWls(page, 1)
    await page.getByTestId('btn-packets').click()
    await page.getByTestId('cfg-speed').selectOption('4')
    await page.getByTestId('btn-start').click()
    await expect(page.getByTestId('journey-row').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('stat-p50')).toContainText('ms')
    await expect(page.getByTestId('stat-success')).toContainText('%')

    await page.getByTestId('journey-row').first().click()
    await expect(page.getByTestId('journey-timeline')).toBeVisible()
    await expect(page.getByTestId('journey-hop')).toHaveCount(5) // world → lb → server → lb → world
    await page.getByTestId('journey-back').click()
    await expect(page.getByTestId('journey-row').first()).toBeVisible()
  })

  test('clicking a moving packet opens its journey', async ({ page }) => {
    await buildWls(page, 1)
    await page.getByTestId('btn-start').click()
    const packet = page.getByTestId('packet').first()
    await expect(packet).toBeAttached({ timeout: 5000 })
    await packet.dispatchEvent('click')
    await expect(page.getByTestId('journey-timeline')).toBeVisible()
    await expect(page.getByTestId('journey-hop').first()).toContainText('world-1')
  })
})
