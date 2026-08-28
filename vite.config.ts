import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist']
  }
})
