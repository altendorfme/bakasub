import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { common } from './locales/en/common'
import { errors } from './locales/en/errors'

/**
 * English is the source language. A new language is one more folder under `locales/` with the
 * same shape (the `en` objects are the type for every other locale).
 */
export const resources = { en: { common, errors } } as const
export const defaultNS = 'common'

export const i18n = i18next.createInstance()
void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS,
  ns: ['common', 'errors'],
  interpolation: { escapeValue: false }, // React already escapes.
  initAsync: false
})
