import { test, expect } from '@playwright/test'
import { buildWls } from './helpers'

test.describe('M6: persistence', () => {
  test('project survives a reload', async ({ page }) => {
    await buildWls(page, 2)
    await page.locator('[data-node-id="lb-1"]').click()
    await page.getByTestId('cfg-algorithm').selectOption('random')
    await page.waitForTimeout(500) // autosave debounce

    await page.reload()
    await expect(page.getByTestId('node-server')).toHaveCount(2)
    await expect(page.locator('.react-flow__edge')).toHaveCount(3)
    await expect(page.locator('[data-node-id="lb-1"] .lab-node__sub')).toHaveText('random')

    // New nodes keep unique ids after reload.
    await page.getByTestId('palette-server').click()
    await expect(page.locator('[data-node-id="server-3"]')).toHaveCount(1)
  })

  test('import replaces the project', async ({ page }) => {
    await buildWls(page, 1)
    const project = {
      id: 'imported',
      name: 'imported',
      settings: { seed: 1 },
      nodes: [
        { id: 'world-1', type: 'world', position: { x: 50, y: 50 }, config: { intensity: 'slow' } },
        { id: 'lb-1', type: 'lb', position: { x: 300, y: 50 }, config: { algorithm: 'leastConnections' } },
        { id: 'server-1', type: 'server', position: { x: 550, y: 50 }, config: { capacity: 3, processingMs: 100 } },
        { id: 'server-2', type: 'server', position: { x: 550, y: 160 }, config: { capacity: 3, processingMs: 100 } },
        { id: 'server-3', type: 'server', position: { x: 550, y: 270 }, config: { capacity: 3, processingMs: 100 } },
      ],
      edges: [
        { id: 'e1', source: 'world-1', target: 'lb-1' },
        { id: 'e2', source: 'lb-1', target: 'server-1' },
        { id: 'e3', source: 'lb-1', target: 'server-2' },
        { id: 'e4', source: 'lb-1', target: 'server-3' },
      ],
    }
    await page.getByTestId('import-file').setInputFiles({
      name: 'p.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    })
    await expect(page.getByTestId('node-server')).toHaveCount(3)
    await expect(page.locator('[data-node-id="lb-1"] .lab-node__sub')).toHaveText('leastConnections')
  })
})
