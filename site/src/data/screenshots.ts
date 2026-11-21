import type { TranslationKey } from '../i18n'

/**
 * Slides of the screenshot carousel, in display order.
 *
 * - `src`: file name inside `site/public/screenshots/` (16:10, 1600x1000). Leave it out and the
 *   slide renders a placeholder window; dropping the image in and filling `src` is the whole swap.
 *   The current images come from `scripts/screenshots/capture.mjs` (real renderer, mocked data).
 * - `alt` / `caption`: i18n keys, so every locale describes the same image.
 * - `icon`: SVG path data (24x24 viewBox, stroked) shown faded inside the placeholder only.
 */
export interface Screenshot {
  id: string
  src?: string
  alt: TranslationKey
  caption: TranslationKey
  icon?: string
}

export const screenshots: readonly Screenshot[] = [
  {
    id: 'wizard',
    src: 'wizard.png',
    alt: 'screenshots.wizard.alt',
    caption: 'screenshots.wizard.caption',
    icon: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5'
  },
  {
    id: 'cost',
    src: 'cost.png',
    alt: 'screenshots.cost.alt',
    caption: 'screenshots.cost.caption',
    icon: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6'
  },
  {
    id: 'queue',
    src: 'queue.png',
    alt: 'screenshots.queue.alt',
    caption: 'screenshots.queue.caption',
    icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'
  },
  {
    id: 'tmdb',
    src: 'tmdb.png',
    alt: 'screenshots.tmdb.alt',
    caption: 'screenshots.tmdb.caption',
    icon: 'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5'
  },
  {
    id: 'presets',
    src: 'presets.png',
    alt: 'screenshots.presets.alt',
    caption: 'screenshots.presets.caption',
    icon: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'
  }
]
