import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Testy sdílejí jednu databázi – spouštět sériově
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
