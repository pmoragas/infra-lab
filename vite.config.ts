/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from /infra-lab/; dev and e2e stay at /.
  base: command === 'build' ? '/infra-lab/' : '/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
