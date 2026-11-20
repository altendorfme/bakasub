import { useEffect } from 'react'
import { useSettings } from '@renderer/data/settings'
import { effectiveLanguage } from './language'
import { i18n } from '.'

/**
 * Keeps i18next on the app language (setting, else the system). UI strings without a
 * translation fall back to English; guides already exist in every app language.
 */
export function useLanguageSync(): void {
  const setting = useSettings().data?.['ui.language']
  useEffect(() => {
    const lang = effectiveLanguage(setting)
    if (i18n.language !== lang) void i18n.changeLanguage(lang)
    document.documentElement.lang = lang
  }, [setting])
}
