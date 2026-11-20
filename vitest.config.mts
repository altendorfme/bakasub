import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    // Main: Node puro (nada pode importar `electron`). Renderer: `// @vitest-environment jsdom`
    // no topo de cada arquivo de teste.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
    setupFiles: ['src/renderer/src/test/setup-dom.ts']
  }
})
