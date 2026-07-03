import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.spec.tsx', 'test/**/*.spec.ts'],
    environment: 'jsdom',
    testTimeout: 10000
  }
})
