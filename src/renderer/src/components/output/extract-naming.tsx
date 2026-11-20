import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ExtractNaming } from '@shared/ipc-contract'
import { NamePreview, OverwriteOption, RadioChoice } from './output-parts'

/**
 * How extracted subtitles are named (player-compatible or with the track id), with a preview and
 * the overwrite choice. `ambiguous`: how many files have several tracks of one language.
 */
export function ExtractNamingChoice({
  naming,
  onNaming,
  overwrite,
  onOverwrite,
  names,
  folder,
  example,
  ambiguous
}: {
  naming: ExtractNaming
  onNaming: (n: ExtractNaming) => void
  overwrite: boolean
  onOverwrite: (v: boolean) => void
  names: readonly string[]
  folder: string
  example?: boolean
  ambiguous: number
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="grid min-w-0 gap-3">
      <RadioChoice
        legend={t('extractPage.naming.label')}
        name="extract-naming"
        value={naming}
        onChange={onNaming}
        options={(['player', 'track'] as const).map((n) => ({
          value: n,
          label: t(`extractPage.naming.${n}`),
          hint: t(`extractPage.naming.${n}Hint`)
        }))}
      />
      {naming === 'player' && ambiguous > 0 ? (
        <p role="status" className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {t('extractPage.naming.ambiguous', { count: ambiguous })}
        </p>
      ) : null}
      <NamePreview names={names} folder={folder} example={example} />
      <OverwriteOption value={overwrite} onChange={onOverwrite} />
    </div>
  )
}
