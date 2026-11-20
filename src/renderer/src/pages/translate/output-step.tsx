import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { pickOutputDir } from '@renderer/data/media'
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-md border bg-background/40 px-3 py-2 text-sm">
            {state.outputDir ?? t('translate.output.nextToSource')}
          </span>
          <Button onClick={() => void pickOutputDir().then((d) => d && onFolder(d))}>
            <FolderOpen />
            {t('translate.output.choose')}
          </Button>
          {state.outputDir ? (
            <Button variant="ghost" onClick={() => onFolder(null)}>
              {t('translate.output.reset')}
            </Button>
          ) : null}
        </div>
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
