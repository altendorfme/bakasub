import { useState, type DragEvent } from 'react'
import { Files, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BatchPlan, BatchSource, OpenDialogKind } from '@shared/ipc-contract'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { errorMessage } from '@renderer/i18n/error-message'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'

/**
 * Batch source: a folder (native dialog + "include subfolders", rescanned when toggled) or
 * several files (dialog or drag & drop). Shared by the Translate and Extract batch wizards.
 */
export function SourcePicker({
  source,
  onSource,
  dialogKind = 'any'
}: {
  source: BatchSource | null
  onSource: (s: BatchSource) => void
  /** Which files the "Choose files" dialog offers. */
  dialogKind?: OpenDialogKind
}): React.JSX.Element {
  const { t } = useTranslation()
  const [recursive, setRecursive] = useState(true)
  const [over, setOver] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const fail = (err: unknown): void => setProblem(errorMessage(err))

  const folder = (): void => {
    unwrap(window.api.dialog.openFolder()).then(({ path }) => {
      setProblem(null)
      if (path) onSource({ type: 'folder', path, recursive })
    }, fail)
  }
  const files = (): void => {
    unwrap(window.api.dialog.openFiles(dialogKind, true)).then(({ paths }) => {
      setProblem(null)
      if (paths.length) onSource({ type: 'files', paths })
    }, fail)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setOver(false)
    const paths = [...e.dataTransfer.files].map((f) => window.api.files.pathFor(f)).filter(Boolean)
    if (paths.length) onSource({ type: 'files', paths })
  }
  const toggleRecursive = (on: boolean): void => {
    setRecursive(on)
    // Already scanning a folder: scan it again with the new choice.
    if (source?.type === 'folder') onSource({ ...source, recursive: on })
  }

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'grid place-items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
          over ? 'border-primary bg-primary-soft/40' : 'border-border bg-background/30'
        )}
      >
        <p className={cn('text-sm break-all', !source && 'text-muted-foreground')}>
          {source?.type === 'folder'
            ? t(source.recursive ? 'batch.files.fromFolderRecursive' : 'batch.files.fromFolder', {
                path: source.path
              })
            : source
              ? t('batch.files.fromFiles', { count: source.paths.length })
              : t('batch.files.drop')}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="default" onClick={folder}>
            <FolderOpen />
            {t('batch.files.folder')}
          </Button>
          <Button onClick={files}>
            <Files />
            {t('batch.files.files')}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={recursive} onCheckedChange={(v) => toggleRecursive(v === true)} />
          {t('batch.files.recursive')}
        </label>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </>
  )
}

/** The plan's warnings: folder over the limit, files the validator refused. */
export function PlanNotices({ plan }: { plan: BatchPlan }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      {plan.truncated ? <p className="text-sm text-warning">{t('batch.files.truncated')}</p> : null}
      {plan.rejected.length ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1 text-sm text-warning">
          <p>{t('batch.files.rejected', { count: plan.rejected.length })}</p>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5 text-xs">
            {plan.rejected.map((r) => (
              <li key={r.path} className="break-all">
                {r.path} ({r.reason})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
