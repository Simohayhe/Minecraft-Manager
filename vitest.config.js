import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/**/*.test.js'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/main/utils.js'],
    },
  },
})
