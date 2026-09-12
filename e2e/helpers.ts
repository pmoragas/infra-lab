import type { Page } from '@playwright/test'

export async function connect(page: Page, from: string, to: string) {
  const src = page.locator(`[data-node-id="${from}"] .react-flow__handle-right`)
  const dst = page.locator(`[data-node-id="${to}"] .react-flow__handle-left`)
  const a = (await src.boundingBox())!
  const b = (await dst.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await page.mouse.up()
}

/** World → LB → N servers, built through the Sidebar. */
export async function buildWls(page: Page, servers = 2) {
  await page.goto('/')
  await page.getByTestId('palette-world').click()
  await page.getByTestId('palette-lb').click()
  for (let i = 0; i < servers; i++) await page.getByTestId('palette-server').click()
  await connect(page, 'world-1', 'lb-1')
  for (let i = 1; i <= servers; i++) await connect(page, 'lb-1', `server-${i}`)
}
