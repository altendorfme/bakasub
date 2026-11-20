import { LanguagePicker } from '@renderer/components/pickers/language-picker'
import { useListWithDefault } from '@renderer/data/preferences'

export function LanguagesStep(): React.JSX.Element {
  const langs = useListWithDefault('translation.targetLangs', 'translation.defaultTargetLang')
  return <LanguagePicker value={langs.value} onChange={langs.onChange} disabled={!langs.ready} />
}
