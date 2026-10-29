import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    projects: [
      {
        test: {
          name: 'host',
          environment: 'node',
          include: ['tests/host/**/*.test.ts', 'tests/shared/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['tests/client/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/client/setup.ts'],
        },
      },
    ],
  },
})
