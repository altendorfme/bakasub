import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const mock = fileURLToPath(new URL('./mock-api.ts', import.meta.url))

/**
 * Serves the real renderer (`src/renderer`) in a plain browser for the site screenshots:
 * installs the mock `window.api` before `main.tsx` and drops the CSP (the mock art is `data:`
 * SVG and Vite's dev client needs inline scripts). Dev-only; never part of the app build.
 */
const showcase = (): Plugin => ({
  name: 'bakasub-showcase',
  transformIndexHtml: (html) =>
    html
      .replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
      .replace(
        '<script type="module" src="/src/main.tsx"></script>',
        `<script type="module" src="/@fs${mock}"></script>\n    <script type="module" src="/src/main.tsx"></script>`
      )
})

export default defineConfig({
  root: resolve(repo, 'src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve(repo, 'src/renderer/src'),
      '@shared': resolve(repo, 'src/shared'),
      '@main': resolve(repo, 'src/main')
    }
  },
  plugins: [showcase(), react(), tailwindcss()],
  server: { fs: { allow: [repo] } },
  logLevel: 'warn'
})
