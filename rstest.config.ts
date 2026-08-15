import { defineConfig } from '@rstest/core'

export default defineConfig({
  include: ['tests/**/*.test.ts'],
  testTimeout: 240_000,
  hookTimeout: 30_000,
  maxConcurrency: 1,
  pool: {
    maxWorkers: 1,
  },
})
