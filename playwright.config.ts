import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
