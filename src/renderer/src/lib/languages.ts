/**
 * Target languages offered in the picker (canonical BCP-47, as the Main stores them). Names come
 * from `Intl.DisplayNames` in the UI language, so the list itself has no text to translate.
 */
export const TARGET_LANGUAGES = [
  'ar',
  'bg',
  'ca',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'es-419',
  'et',
  'fa',
  'fi',
  'fil',
  'fr',
  'he',
  'hi',
  'hr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'lt',
  'lv',
  'ms',
  'nb',
  'nl',
  'pl',
  'pt-BR',
  'pt-PT',
  'ro',
  'ru',
  'sk',
  'sl',
  'sr',
  'sv',
  'th',
  'tr',
  'uk',
  'vi',
  'zh-Hans',
  'zh-Hant'
] as const

const cache = new Map<string, Intl.DisplayNames>()

/** "Brazilian Portuguese" / "português (Brasil)"; the tag itself when the runtime has no name. */
export function languageName(tag: string, uiLang: string): string {
  let names = cache.get(uiLang)
  if (!names) {
    names = new Intl.DisplayNames([uiLang, 'en'], { type: 'language', fallback: 'code' })
    cache.set(uiLang, names)
  }
  try {
    const name = names.of(tag) ?? tag
    // Portuguese, Spanish, French… names are lowercase in CLDR ("português"); as a label they
    // start with a capital ("Português (Brasil)").
    return name.charAt(0).toLocaleUpperCase(uiLang) + name.slice(1)
  } catch {
    return tag
  }
}
