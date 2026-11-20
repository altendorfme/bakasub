import { useTranslation } from 'react-i18next'
import type { BatchPlan, BatchSource } from '@shared/ipc-contract'
import { PlanNotices, SourcePicker } from '@renderer/components/files/source-picker'
import { errorMessage } from '@renderer/i18n/error-message'
import type { ExtractRow } from './extract-batch-state'

/** Folder (with subfolders) or several videos; shows what the plan found and what it skipped. */
export function ExtractFilesStep({
  source,
  onSource,
  plan,
  pending,
  error,
  rows
}: {
  source: BatchSource | null
  onSource: (s: BatchSource) => void
  plan: BatchPlan | null | undefined
  pending: boolean
  error: Error | null
  rows: readonly ExtractRow[] | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const empty = source && !pending && !error && (!plan || plan.items.length === 0)
  const skipped = rows?.filter((r) => r.item.skipped) ?? []
  const ready = rows?.filter((r) => r.include).length ?? 0
  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">{t('extractBatch.files.body')}</p>
      <SourcePicker source={source} onSource={onSource} dialogKind="media" />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : null}
      {pending ? <p className="text-sm text-muted-foreground">{t('batch.files.reading')}</p> : null}
      {empty ? <p className="text-sm text-warning">{t('extractBatch.files.none')}</p> : null}
      {plan ? <PlanNotices plan={plan} /> : null}
      {rows?.length ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="status">
          <span className="text-success">{t('batch.status.ready', { count: ready })}</span>
          {skipped.length ? (
            <span className="text-muted-foreground">
              {t('batch.status.out', { count: skipped.length })}
            </span>
          ) : null}
        </p>
      ) : null}
      {skipped.length ? (
        <details className="rounded-lg border bg-background/30 p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {t('batch.issues.out', { count: skipped.length })}
          </summary>
          <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5">
            {skipped.map((r) => (
              <li key={r.item.path} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 break-all">{r.item.relPath}</span>
                <span className="text-muted-foreground" title={r.item.error}>
                  {t(`batch.problem.${r.item.skipped!}`)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}
