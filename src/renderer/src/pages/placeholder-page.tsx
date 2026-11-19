import { useTranslation } from 'react-i18next'
import type { PageKey } from '@renderer/app/pages'

/** Stand-in until each screen is built. */
export function PlaceholderPage({ page }: { page: PageKey }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="px-8 py-7">
      <h1 className="text-xl font-semibold tracking-tight">{t(`pages.${page}.title`)}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('pages.notBuilt')}</p>
    </div>
  )
}
