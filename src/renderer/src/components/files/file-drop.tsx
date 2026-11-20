import { useState, type DragEvent } from 'react'
import { FileText, FileVideo, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { sourceKindOf } from '@shared/file-types'
import { Button } from '@renderer/components/ui/button'
import { pickFile } from '@renderer/data/media'
import { errorMessage } from '@renderer/i18n/error-message'
import { cn } from '@renderer/lib/utils'
import type { WizardState } from './wizard-state'

/** Drop zone + native dialog. Paths come from the dialog or `files.pathFor` (never typed). */
export function FileStep({
  file,
  onFile
}: {
  file: WizardState['file']
  onFile: (path: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const accept = (path: string | null): void => {
    if (!path) return
    if (!sourceKindOf(path)) return setProblem(t('translate.file.unsupported'))
    setProblem(null)
    onFile(path)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) accept(window.api.files.pathFor(dropped))
  }
  const browse = (): void => {
    pickFile('any').then(accept, (err: unknown) => setProblem(errorMessage(err)))
  }

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'grid place-items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          over ? 'border-primary bg-primary-soft/40' : 'border-border bg-background/30'
        )}
      >
        {file ? (
          <>
            {file.kind === 'video' ? (
              <FileVideo className="size-8 text-violet" />
            ) : (
              <FileText className="size-8 text-violet" />
            )}
            <span className="text-sm font-medium break-all">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {file.kind === 'video' ? t('translate.file.video') : t('translate.file.subtitle')}
            </span>
            <Button size="sm" onClick={browse}>
              {t('translate.file.change')}
            </Button>
          </>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground" />
            <span className="text-sm">{t('translate.file.drop')}</span>
            <span className="text-xs text-muted-foreground">{t('translate.file.or')}</span>
            <Button variant="default" onClick={browse}>
              {t('translate.file.browse')}
            </Button>
          </>
        )}
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
