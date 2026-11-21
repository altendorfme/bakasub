# Website

The landing page lives in `site/`: Astro 5 + Tailwind CSS v4, static output, published under `base: '/bakasub'` (GitHub Pages). It is a separate npm project, outside the root package: its CI installs only `site/`, so the app's `postinstall` (sidecars, native rebuilds) never runs there.

```bash
cd site
npm install
npm run dev      # http://localhost:4321/bakasub/
npm run build    # astro check + static build into site/dist
npm run preview  # serves site/dist under /bakasub/
```

## Brand sources, read in place

The site has no copy of the palette, the fonts or the logos. `site/astro.config.ts` aliases the folders outside `site/` and lists them in `vite.server.fs.allow`:

| Alias        | Folder                    | Used for                                                                       |
| ------------ | ------------------------- | ------------------------------------------------------------------------------ |
| `@brand`     | `src/shared/brand`        | `fonts.css`, `tokens.css`, `theme.css` (see [brand tokens](./brand-tokens.md)) |
| `@resources` | `resources`               | `icon.svg`: favicon, nav and footer mark                                       |
| `@assets`    | `src/renderer/src/assets` | `logo.svg`: hero lockup                                                        |
| `@docs`      | `docs`                    | README logos, screenshots (later phases)                                       |

`site/tsconfig.json` mirrors the aliases for `astro check`. In dev, Vite serves these files from their origin (`/@fs/...`); in the build they are emitted as hashed files in `dist/_astro/`. `build.assetsInlineLimit: 0` keeps SVGs as files instead of data URIs.

`src/shared/brand/fonts.css` imports `@fontsource-variable/*` by bare name; resolved from its own folder, that would reach the root `node_modules`. The config pins both packages to `site/node_modules`, and `site/package.json` declares them, so the fonts are self-hosted from the site's own install.

`site/package.json` overrides `vite` to the version Astro 5 ships (6.x): `@tailwindcss/vite` would otherwise pull a newer Vite, and two copies break the plugin types in `astro check`.

## Logos

`resources/icon.svg` (square app icon) and `src/renderer/src/assets/logo.svg` (icon + "Bakasub" wordmark, transparent background) draw the same mark; the lockup embeds the icon. The site uses the icon wherever a small square mark fits (favicon, nav, footer) and the lockup in the hero. `docs/bakasub-logo-*.svg` carry a localized tagline baked into the image and an opaque background: they stay for the READMEs, the site renders its text as HTML so it can be translated.

## Structure

- `src/layouts/Base.astro`: `<head>` (title, description, favicon, canonical, Open Graph), global stylesheet.
- `src/components/`: `Nav`, `Hero`, `Footer`, `GitHubIcon`.
- `src/styles/global.css`: Tailwind, then the shared brand files, then base rules. No token value is defined here.
- `src/i18n/`: `en.ts` is the reference dictionary (`Dictionary` derives from it, so another locale missing a key fails type checking), `links.ts` holds the external URLs, `index.ts` exposes `useTranslations(locale)`. Components take a `locale` prop.

Download buttons point to the GitHub Releases page; resolving the per-OS asset comes with the release integration.
