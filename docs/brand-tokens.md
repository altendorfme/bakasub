# Brand tokens

The visual identity (palette, radius, font stacks, gradient) lives in one place, `src/shared/brand/`, so the app and the site cannot drift apart. Changing a color there changes both on their next build.

## Files

| File         | Contents                                                                                                                                                              | Depends on                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `tokens.css` | Plain CSS custom properties on `:root` (`color-scheme: dark`, colors, `--radius`, `--brand-font-sans`, `--brand-font-mono`, `--brand-gradient`). The source of truth. | Nothing                          |
| `fonts.css`  | `@font-face` rules for Schibsted Grotesk and JetBrains Mono (variable weight, upright + italic), through `@fontsource-variable/*`.                                    | The two Fontsource packages      |
| `theme.css`  | Tailwind CSS v4 mapping: `@theme inline` (`bg-primary`, `text-muted-foreground`, `rounded-lg`, `font-sans`/`font-mono`…) and the `bg-brand` utility.                  | Tailwind v4, `tokens.css` loaded |

The split keeps `tokens.css` usable without any framework: a page written in plain CSS reads `var(--primary)` or `var(--brand-font-sans)` directly. Only a Tailwind v4 consumer imports `theme.css`.

## Tokens

Dark only. Color names follow shadcn/ui so its components drop in unchanged; `primary-soft`, `violet`, `success` and `warning` are ours.

- Surfaces: `background`, `card`, `popover`, `muted`, `accent`, `secondary` (each with a `-foreground` pair), `border`, `input`.
- Brand: `primary` (pink `#f472b6`), `primary-soft` (dark pink wash), `violet` (`#a78bfa`), `ring` (= primary), `--brand-gradient` (135° primary → violet, the `bg-brand` utility).
- Status: `destructive`, `success`, `warning`.
- Shape: `--radius` (0.625rem); Tailwind derives `rounded-sm|md|lg|xl` from it.
- Type: `--brand-font-sans` (Schibsted Grotesk Variable, then system sans), `--brand-font-mono` (JetBrains Mono Variable, then system mono). The family names match the Fontsource packages, so `fonts.css` must be loaded for them to apply.

The logo and app icon SVGs (`resources/icon.svg`, `docs/bakasub-logo-*.svg`) hard-code the same pink and violet; they are images, not CSS, and are kept in sync by hand.

## Consuming

Import order matters: Tailwind first, then fonts, tokens, theme.

```css
@import 'tailwindcss';
@import '@shared/brand/fonts.css';
@import '@shared/brand/tokens.css';
@import '@shared/brand/theme.css';
```

- **Renderer**: `src/renderer/src/styles/main.css`, through the existing `@shared` Vite alias (`electron.vite.config.ts`). `@tailwindcss/vite` resolves CSS `@import` with Vite's resolver, so aliases work.
- **Site**: `site/src/styles/global.css`, through the `@brand` alias (`site/astro.config.ts`, which also pins the Fontsource packages to `site/node_modules`). The site has no copy of these values. See [website](./site.md).

`fonts.css` resolves `@fontsource-variable/*` from the repository root `node_modules` (Node resolution walks up from `src/shared/brand/`). A consumer with its own `node_modules` declares the two packages and aliases them to its install, as the site does.

## Rules

- Add or change a token in `tokens.css`; if Tailwind needs it as a utility, map it in `theme.css`. Never redefine a token value in a consumer.
- Fonts are bundled, never loaded from a CDN: the app runs offline with CSP `font-src 'self'`.
- Out of scope today: a light theme. A future one would override the same variables under a selector in `tokens.css`, without touching `theme.css`.
