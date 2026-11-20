import { useTranslation } from 'react-i18next'
import { LanguagePicker } from '@renderer/components/pickers/language-picker'
import { useListWithDefault } from '@renderer/data/preferences'

export function LanguagesPage(): React.JSX.Element {
  const { t } = useTranslation()
  const langs = useListWithDefault('translation.targetLangs', 'translation.defaultTargetLang')
  return (
    <div className="mx-auto grid max-w-3xl gap-5 px-6 py-7">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('pages.languages.title')}</h1>
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t('languagesPage.body')}</p>
      </div>
      <div className="rounded-xl border bg-card/92 p-4">
        <LanguagePicker value={langs.value} onChange={langs.onChange} disabled={!langs.ready} />
      </div>
    </div>
  )
}
