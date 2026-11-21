import { en, type TranslationKey } from './en'

/** Locales the site ships. F4 adds `pt` (served under `/pt/`). */
export const locales = ['en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

const dictionaries = { en } satisfies Record<Locale, Record<TranslationKey, string>>

/** Returns a translator bound to `locale`. */
export function useTranslations(locale: Locale = defaultLocale) {
  const dict = dictionaries[locale]
  return (key: TranslationKey): string => dict[key]
}

export { links } from './links'
