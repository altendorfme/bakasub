import { defineRouteMiddleware } from '@astrojs/starlight/route-data'
import iconUrl from '@resources/icon.svg?url'

/*
 * Starlight only takes a favicon from `public/`; the site reads `resources/icon.svg` in place instead
 * (docs/site.md#brand-sources-read-in-place), so swap the href for the bundled asset. Also adds the
 * landing page's Open Graph image, which Starlight does not emit.
 */
export const onRequest = defineRouteMiddleware((context) => {
  const { head } = context.locals.starlightRoute
  for (const { tag, attrs } of head) {
    // Starlight emits `rel="shortcut icon"` pointing at `/favicon.svg`.
    if (tag === 'link' && attrs && String(attrs.rel ?? '').split(/\s+/).includes('icon')) {
      attrs.rel = 'icon'
      attrs.href = iconUrl
      attrs.type = 'image/svg+xml'
      delete attrs.sizes
    }
  }
  const site = context.site
  if (site) {
    const ogImage = new URL(`${import.meta.env.BASE_URL.replace(/\/+$/, '')}/og.png`, site).href
    head.push(
      { tag: 'meta', attrs: { property: 'og:image', content: ogImage } },
      { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
      { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
      { tag: 'meta', attrs: { name: 'twitter:image', content: ogImage } }
    )
  }
})
