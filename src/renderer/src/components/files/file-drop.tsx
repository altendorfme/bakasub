import { useState, type DragEvent } from 'react'
import { FileText, FileVideo, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { OpenDialogKind } from '@shared/ipc-contract'
import { sourceKindOf, type SourceKind } from '@shared/file-types'
import { Button } from '@renderer/components/ui/button'
import { pickFile } from '@renderer/data/media'
import { errorMessage } from '@renderer/i18n/error-message'
import { cn } from '@renderer/lib/utils'

const DIALOG: Record<string, OpenDialogKind> = { video: 'media', subtitle: 'subtitle', any: 'any' }

/**
 * Drop zone + native dialog for one file. Paths come from the dialog or `files.pathFor`
 * (never typed). `accept` limits the kinds; the Main revalidates every path anyway.
 */
export function FileDrop({
  path,
  accept = ['video', 'subtitle'],
  onFile
}: {
  path: string | null
  accept?: readonly SourceKind[]
  onFile: (path: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const kind = path ? sourceKindOf(path) : null
  const dialogKind = DIALOG[accept.length === 1 ? accept[0] : 'any']
  const unsupported =
    accept.length === 1 && accept[0] === 'video'
      ? t('files.videoOnly')
      : t('translate.file.unsupported')

  const take = (p: string | null): void => {
    if (!p) return
    const k = sourceKindOf(p)
    if (!k || !accept.includes(k)) return setProblem(unsupported)
    setProblem(null)
    onFile(p)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) take(window.api.files.pathFor(dropped))
  }
  const browse = (): void => {
    pickFile(dialogKind).then(take, (err: unknown) => setProblem(errorMessage(err)))
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
        {path ? (
          <>
            {kind === 'video' ? (
              <FileVideo className="size-8 text-violet" />
            ) : (
              <FileText className="size-8 text-violet" />
            )}
            <span className="text-sm font-medium break-all">{path.split(/[\\/]/).pop()}</span>
            <span className="text-xs text-muted-foreground">
              {kind === 'video' ? t('translate.file.video') : t('translate.file.subtitle')}
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
