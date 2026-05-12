import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: false,
    // Allow next-auth to resolve next/server via package.json exports field
    resolve: {
      conditions: ['node', 'module', 'import', 'default'],
    },
  },
})
