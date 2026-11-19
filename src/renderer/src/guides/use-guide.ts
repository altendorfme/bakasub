import { useTranslation } from 'react-i18next'
import { getGuide, type Guide, type GuideId } from './guides'

/** O guia no idioma atual do app (troca junto com o idioma). */
export function useGuide(id: GuideId): Guide {
  const { i18n } = useTranslation()
  // `language` (o pedido), não `resolvedLanguage`: o guia pode existir num idioma que a UI ainda não tem.
  return getGuide(id, i18n.language)
}
