import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
