import { useTranslation } from 'react-i18next'
import { APP_LANGUAGES, type AppLanguage } from '@shared/ipc-contract'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useSetting } from '@renderer/data/preferences'
import { languageName } from '@renderer/lib/languages'
import { cn } from '@renderer/lib/utils'

const SYSTEM = 'system'

/** App language (`ui.language`): "same as the system" or each language in its own name. */
export function LanguageSelect({
  className,
  id
}: {
  className?: string
  id?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const [lang, setLang] = useSetting('ui.language')
  return (
    <Select
      value={lang ?? SYSTEM}
      onValueChange={(v) => setLang(v === SYSTEM ? null : (v as AppLanguage))}
    >
      <SelectTrigger
        id={id}
        className={cn('w-56', className)}
        aria-label={t('settings.general.language')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SYSTEM}>{t('settings.general.system')}</SelectItem>
        {APP_LANGUAGES.map((l) => (
          // Own name, so it is findable whatever the current language is.
          <SelectItem key={l} value={l} lang={l}>
            {languageName(l, l)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
