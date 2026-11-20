import { useTranslation } from 'react-i18next'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { OutputFolder } from '@renderer/components/files/output-folder'
import type { WizardState } from './wizard-state'

/** Output folder; for videos also the mux options (hidden for subtitle files). */
export function OutputStep({
  state,
  onFolder,
  onMux
}: {
  state: WizardState
  onFolder: (dir: string | null) => void
  onMux: (patch: Partial<WizardState['mux']>) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const video = state.file?.kind === 'video'
  const options: { key: keyof WizardState['mux']; label: string }[] = [
    { key: 'setDefault', label: t('translate.output.setDefault') },
    { key: 'keepOriginalSubtitles', label: t('translate.output.keepOriginal') },
    { key: 'alsoWriteSubtitle', label: t('translate.output.alsoWrite') }
  ]
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{t('translate.output.folder')}</span>
        <OutputFolder value={state.outputDir} onChange={onFolder} />
      </div>
      {video ? (
        <div className="grid gap-2">
          {options.map((o) => (
            <label key={o.key} className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={state.mux[o.key]}
                onCheckedChange={(v) => onMux({ [o.key]: v === true })}
              />
              {o.label}
            </label>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('translate.output.summary')}</p>
    </div>
  )
}
