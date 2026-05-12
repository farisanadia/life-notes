import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    conditions: ['node', 'module', 'import', 'default'],
  },
  test: {
    environment: 'node',
    globals: false,
  },
})
