import { en, type TranslationKey } from './en'
import { pt } from './pt'

/**
 * Locales the landing page ships, in the order of the language switcher: `en` is served at the root,
 * `pt` under `/pt/` (`src/pages/pt/`). Not declared in Astro's `i18n` config: Starlight owns that
 * config for the English-only docs (see docs/site.md#languages), so the URLs are built here.
 */
export const locales = ['en', 'pt'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

const dictionaries = { en, pt } satisfies Record<Locale, Record<TranslationKey, string>>

/**
 * Per-locale metadata. `tag` is the BCP 47 tag for `<html lang>`, `hreflang` and `lang` attributes,
 * `ogLocale` the Open Graph form, `name` the endonym shown in the switcher.
 */
export const localeInfo = {
  en: { tag: 'en', ogLocale: 'en_US', name: 'English', short: 'EN' },
  pt: { tag: 'pt-BR', ogLocale: 'pt_BR', name: 'Português', short: 'PT' }
} as const satisfies Record<Locale, { tag: string; ogLocale: string; name: string; short: string }>

/** `import.meta.env.BASE_URL` with exactly one trailing slash (`/`). */
const base = `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/`

/** Path of a site page, under the base: `sitePath('docs/')` -> `/docs/`. */
export function sitePath(path = ''): string {
  return `${base}${path.replace(/^\/+/, '')}`
}

/** Home page of `locale`, relative to the domain: `/` or `/pt/`. */
export function localeHomePath(locale: Locale): string {
  return sitePath(locale === defaultLocale ? '' : `${locale}/`)
}

/** Absolute URL of the home page of `locale` (canonical, hreflang). Needs `site` in the Astro config. */
export function localeHomeUrl(locale: Locale, site: URL | undefined): string {
  if (!site) throw new Error('`site` must be set in astro.config.ts to build absolute URLs')
  return new URL(localeHomePath(locale), site).href
}

/** Returns a translator bound to `locale`. */
export function useTranslations(locale: Locale = defaultLocale) {
  const dict = dictionaries[locale]
  return (key: TranslationKey): string => dict[key]
}

/** Fills `{name}` placeholders of a translated string. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

export type { TranslationKey }
export { links } from './links'
