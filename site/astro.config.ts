import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import starlight from '@astrojs/starlight'
import { docsDir, repoUrl } from './src/docs/paths'
import { docsSidebar } from './src/docs/sidebar'
import { remarkRepoDocs } from './src/docs/remark-repo-docs'

const fromSite = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/*
 * Brand sources live outside `site/` and are read in place, never copied:
 * - `@brand`     -> src/shared/brand (tokens.css, fonts.css, theme.css; shared with the renderer)
 * - `@resources` -> resources (app icon)
 * - `@assets`    -> src/renderer/src/assets (logo lockup)
 * - `@docs`      -> docs (README logos)
 * The docs pages read docs/*.md in place too: src/content.config.ts + src/docs/.
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

const base = '/bakasub'

export default defineConfig({
  site: 'https://lsilvatti.github.io',
  base,
  trailingSlash: 'ignore',
  // Starlight turns prefetch-on-hover on for every page when unset; keep the landing's JS unchanged.
  prefetch: false,
  /*
   * No Astro `i18n` block: Starlight cannot share it with its own `locales`, and inferring them from it
   * would generate `/pt/docs/*` fallback pages. The landing builds its locale URLs itself
   * (src/i18n/index.ts, English at the root, Portuguese under /pt/); the docs are English only.
   */
  integrations: [
    starlight({
      title: 'BakaSub Docs',
      description: 'User guide and developer documentation for BakaSub.',
      locales: { root: { label: 'English', lang: 'en' } },
      logo: { src: '@resources/icon.svg', alt: 'BakaSub' },
      social: [{ icon: 'github', label: 'GitHub', href: repoUrl }],
      sidebar: docsSidebar(),
      customCss: ['@brand/fonts.css', '@brand/tokens.css', './src/styles/docs.css'],
      components: {
        ThemeProvider: './src/components/docs/ThemeProvider.astro',
        ThemeSelect: './src/components/docs/ThemeSelect.astro'
      },
      routeMiddleware: './src/docs/route-middleware.ts',
      // GitHub Pages serves one 404.html for the whole site; Starlight's would replace the landing's look.
      disable404Route: true,
      expressiveCode: { themes: ['github-dark'] }
    })
  ],
  markdown: {
    // Scoped to files directly in docs/: other Markdown is left untouched.
    remarkPlugins: [[remarkRepoDocs, { base }]]
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
        allow: [fromSite('.'), ...Object.values(brandDirs), docsDir]
      }
    }
  }
})
