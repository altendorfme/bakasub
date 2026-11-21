import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

const fromSite = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/*
 * Brand sources live outside `site/` and are read in place, never copied:
 * - `@brand`     -> src/shared/brand (tokens.css, fonts.css, theme.css; shared with the renderer)
 * - `@resources` -> resources (app icon)
 * - `@assets`    -> src/renderer/src/assets (logo lockup)
 * - `@docs`      -> docs (README logos, screenshots for later phases)
 */
const brandDirs = {
  '@brand': fromSite('../src/shared/brand'),
  '@resources': fromSite('../resources'),
  '@assets': fromSite('../src/renderer/src/assets'),
  '@docs': fromSite('../docs')
}

/*
 * `fonts.css` imports the Fontsource packages by bare name; from `src/shared/brand/` Node resolution
 * would walk up to the repository root `node_modules`, which the site CI never installs.
 * Pin them to the site's own install.
 */
const fontPackages = [
  '@fontsource-variable/schibsted-grotesk',
  '@fontsource-variable/jetbrains-mono'
]

export default defineConfig({
  site: 'https://lsilvatti.github.io',
  base: '/bakasub',
  trailingSlash: 'ignore',
  // Keep in sync with `locales` in src/i18n/index.ts. English at the root, Portuguese under /pt/.
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'pt'],
    routing: { prefixDefaultLocale: false }
  },
  vite: {
    plugins: [tailwindcss()],
    // Keep SVGs as real files: the icon is used three times per page and must stay cacheable.
    build: { assetsInlineLimit: 0 },
    resolve: {
      alias: [
        ...Object.entries(brandDirs).map(([find, replacement]) => ({ find, replacement })),
        ...fontPackages.map((pkg) => ({
          find: pkg,
          replacement: fromSite(`./node_modules/${pkg}`)
        }))
      ]
    },
    server: {
      fs: {
        allow: [fromSite('.'), ...Object.values(brandDirs)]
      }
    }
  }
})
