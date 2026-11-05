import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'worker/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/lib/supabase.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
      reporter: ['text', 'json-summary'],
    },
  },
})
