import { useTranslation } from 'react-i18next'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { OutputFolder } from '@renderer/components/files/output-folder'

export interface MuxChoice {
  setDefault: boolean
  keepOriginalSubtitles: boolean
  alsoWriteSubtitle: boolean
}

/** Output folder; for videos also the mux options (hidden for subtitle files). */
export function OutputStep({
  video,
  outputDir,
  mux,
  onFolder,
  onMux,
  summary
}: {
  video: boolean
  outputDir: string | null
  mux: MuxChoice
  onFolder: (dir: string | null) => void
  onMux: (patch: Partial<MuxChoice>) => void
  /** Replaces the closing note (the batch has its own). */
  summary?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const options: { key: keyof MuxChoice; label: string }[] = [
    { key: 'setDefault', label: t('translate.output.setDefault') },
    { key: 'keepOriginalSubtitles', label: t('translate.output.keepOriginal') },
    { key: 'alsoWriteSubtitle', label: t('translate.output.alsoWrite') }
  ]
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{t('translate.output.folder')}</span>
        <OutputFolder value={outputDir} onChange={onFolder} />
      </div>
      {video ? (
        <div className="grid gap-2">
          {options.map((o) => (
            <label key={o.key} className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={mux[o.key]}
                onCheckedChange={(v) => onMux({ [o.key]: v === true })}
              />
              {o.label}
            </label>
          ))}
        </div>
      ) : null}
      {summary ?? <p className="text-xs text-muted-foreground">{t('translate.output.summary')}</p>}
    </div>
  )
}
