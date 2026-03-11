import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['worker/**/*.test.js'],
    exclude: ['worker/**/*.integration.test.js'],
    setupFiles: ['./worker/test/setup.js'],
  },
})
