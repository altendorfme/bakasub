import { en, type TranslationKey } from './en'
import { pt } from './pt'

/**
 * Locales the site ships, in the order of the language switcher. Must match `i18n.locales` in
 * `astro.config.ts`: `en` is served at the root, `pt` under `/pt/`.
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
