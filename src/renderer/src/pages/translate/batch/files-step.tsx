import { useState, type DragEvent } from 'react'
import { Files, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BatchPlan, BatchSource } from '@shared/ipc-contract'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { errorMessage } from '@renderer/i18n/error-message'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'
import type { BatchCtx } from './batch-ctx'
import { StatusLine } from './batch-parts'
import type { BatchFlavor } from './batch-state'

/** Folder (with the subfolders toggle) or several files, from the dialogs or drag & drop. */
export function FilesStep({
  source,
  onSource,
  plans,
  flavor,
  onFlavor,
  identifying,
  ctx
}: {
  source: BatchSource | null
  onSource: (s: BatchSource) => void
  plans: { pipeline?: BatchPlan; translate?: BatchPlan; pending: boolean; error: Error | null }
  flavor: BatchFlavor | null
  onFlavor: (f: BatchFlavor) => void
  identifying: boolean
  ctx: BatchCtx | null
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
    unwrap(window.api.dialog.openFiles('any', true)).then(({ paths }) => {
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

  const plan = flavor ? plans[flavor] : undefined
  const counts = {
    pipeline: plans.pipeline?.items.length ?? 0,
    translate: plans.translate?.items.length ?? 0
  }
  const empty = source && !plans.pending && !plans.error && counts.pipeline + counts.translate === 0

  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">{t('batch.files.body')}</p>
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
      {plans.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(plans.error)}
        </p>
      ) : null}
      {plans.pending ? (
        <p className="text-sm text-muted-foreground">{t('batch.files.reading')}</p>
      ) : null}
      {empty ? <p className="text-sm text-warning">{t('batch.files.none')}</p> : null}

      {counts.pipeline && counts.translate ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('batch.files.both')}</span>
          {(['pipeline', 'translate'] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={flavor === k ? 'default' : 'outline'}
              aria-pressed={flavor === k}
              onClick={() => onFlavor(k)}
            >
              {t(k === 'pipeline' ? 'batch.files.videos' : 'batch.files.subtitles', {
                count: counts[k]
              })}
            </Button>
          ))}
        </div>
      ) : null}

      {plan?.truncated ? (
        <p className="text-sm text-warning">{t('batch.files.truncated')}</p>
      ) : null}
      {plan?.rejected.length ? (
        <div className="grid gap-1 text-sm text-warning">
          <p>{t('batch.files.rejected', { count: plan.rejected.length })}</p>
          <ul className="grid gap-0.5 text-xs">
            {plan.rejected.map((r) => (
              <li key={r.path} className="break-all">
                {r.path} ({r.reason})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {identifying ? (
        <p className="text-sm text-muted-foreground">{t('batch.files.identifying')}</p>
      ) : null}
      {ctx ? <StatusLine ctx={ctx} /> : null}
    </>
  )
}
