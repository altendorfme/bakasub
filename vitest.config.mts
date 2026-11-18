import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared'), '@main': resolve('src/main') }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Testes cobrem módulos puros; nada aqui pode importar `electron`.
    clearMocks: true
  }
})
