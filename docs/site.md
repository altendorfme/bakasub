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
- `src/components/`: `Nav`, `Hero`, `Screenshots`, `Features`, `Pipeline`, `Privacy`, `Footer`, `GitHubIcon`, `carousel/`; shared pieces `SectionHeader` (kicker, `<h2>`, lead) and `Icon`.
- `src/data/screenshots.ts`: the carousel slides (see below).
- `src/data/features.ts`: the feature grid, the three pipeline steps and the privacy points, as `{ id, icon, title, body }` where `title`/`body` are `TranslationKey`s (no text in components). `src/data/icons.ts`: the stroke icons (24×24 paths) that `Icon.astro` draws.
- `src/styles/global.css`: Tailwind, then the shared brand files, then base rules. No token value is defined here.
- `src/i18n/`: `en.ts` is the reference dictionary (`Dictionary` derives from it, so another locale missing a key fails type checking), `links.ts` holds the external URLs, `index.ts` exposes `useTranslations(locale)`. Components take a `locale` prop.

Download buttons point to the GitHub Releases page; resolving the per-OS asset comes with the release integration.

## Screenshot carousel

`components/carousel/Carousel.astro` renders the slides of `src/data/screenshots.ts` (`{ id, src?, alt, caption, icon? }`), no library.

- **Without JS** it is a horizontal strip with `overflow-x: auto` and `scroll-snap-type: x mandatory`: touch, trackpad and the arrow keys (the track is focusable) all work, and the controls stay `hidden`.
- **`carousel.ts`** (progressive enhancement) shows previous/next buttons and dots, handles `ArrowLeft`/`ArrowRight`/`Home`/`End` anywhere inside the carousel, and tracks the active slide with an `IntersectionObserver` (threshold 0.6) to set `aria-current` on the dot and disable the buttons at the ends. No autoplay. Programmatic scrolls are `smooth` unless `prefers-reduced-motion: reduce`, in which case they jump; the CSS `scroll-behavior` follows the same media query.
- **ARIA**: `<section aria-roledescription="carousel" aria-label>`, each slide a `<figure role="group" aria-roledescription="slide" aria-label="2 of 5">` with a visible `figcaption`.
- **Strings** come from i18n: `carousel.*` for the chrome (`{index}`/`{total}` filled by `format()` from `src/i18n`), `screenshots.<id>.caption|alt` per slide.

**Adding a screenshot**: put a 16:10 image (1600x1000) in `site/public/screenshots/` and set `src` to its file name in `src/data/screenshots.ts`. Without `src` the slide shows a placeholder (app window frame, faded `icon`, caption); no component changes either way.

### Capturing the screenshots

The images are taken from the real renderer, not mock-ups, by `scripts/screenshots/`:

- `vite.config.mts` serves `src/renderer` in a plain browser, injecting `mock-api.ts` before `main.tsx` and dropping the CSP (dev-only, never part of the app build).
- `mock-api.ts` is an in-memory `window.api` typed against `BakaSubApi` (IPC contract changes break it at type level). It reuses `BUILTIN_PRESETS` and answers with copies (`structuredClone`), like the real IPC. The library is a fictional show ("Starlight Courier") with original SVG art from `art.ts`: no TMDB image or real release appears on the site.
- `capture.mjs` starts that server, drives each scene with Playwright (1600x1000, `en-US`, UTC, reduced motion) and writes `site/public/screenshots/<id>.png`.

```bash
npm i --no-save --ignore-scripts playwright-core   # once; not a project dependency
node scripts/screenshots/capture.mjs                 # all scenes
node scripts/screenshots/capture.mjs --only=cost,queue --chrome=/path/to/chrome
```

Scenes find elements by their English labels ("Browse files", "Continue", "Estimate cost"); renaming one of them in the app means updating `capture.mjs`. A failing scene saves the page to the OS temp folder and the script exits non-zero. Re-run it after visible UI changes.

## Content sections

`Features` (7 cards, the README "What it does" list), `Pipeline` (Extract → Translate → Re-mux, an `<ol>` with inline SVG arrows) and `Privacy` (no account, no telemetry, local key and files, plus what does leave the machine) take every string from `features.*`, `pipeline.*` and `privacy.*` in `en.ts`. Each section is a `<section aria-labelledby>` on its `<h2>`, items are `<h3>`; anchors `#features`, `#how-it-works`, `#privacy`.

Claims must match the README and the docs, never go further: the privacy copy follows [user guide › Privacy](./user-guide.md#privacy-what-leaves-your-computer) (it links there), the pipeline follows [jobs](./jobs.md). Change the docs first, then the site.
