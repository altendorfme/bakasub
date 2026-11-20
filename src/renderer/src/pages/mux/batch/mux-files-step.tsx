import { useTranslation } from 'react-i18next'
import type { BatchMuxPlan, BatchSource } from '@shared/ipc-contract'
import { SourcePicker } from '@renderer/components/files/source-picker'
import { errorMessage } from '@renderer/i18n/error-message'
import type { MuxView } from './mux-batch-state'

/** Folder (with subfolders) or loose files: MKVs and subtitles mixed; shows what the plan found. */
export function MuxFilesStep({
  source,
  onSource,
  plan,
  view,
  pending,
  error
}: {
  source: BatchSource | null
  onSource: (s: BatchSource) => void
  plan: BatchMuxPlan | null | undefined
  view: MuxView | null
  pending: boolean
  error: Error | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const empty =
    source && !pending && !error && plan && !plan.items.length && !plan.unmatchedVideos.length
  const paired = view?.rows.filter((r) => r.subs.length > 0).length ?? 0
  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">{t('muxBatch.files.body')}</p>
      <SourcePicker source={source} onSource={onSource} dialogKind="any" />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : null}
      {pending ? <p className="text-sm text-muted-foreground">{t('batch.files.reading')}</p> : null}
      {empty ? <p className="text-sm text-warning">{t('muxBatch.files.none')}</p> : null}
      {plan?.truncated ? (
        <p className="text-sm text-warning">{t('batch.files.truncated')}</p>
      ) : null}
      {plan?.rejected.length ? (
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
      {plan && view && (plan.items.length || plan.unmatchedVideos.length) ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="status">
          <span className="text-success">{t('muxBatch.status.paired', { count: paired })}</span>
          {view.unresolved.length ? (
            <span className="text-warning">
              {t('muxBatch.status.unmatchedSubs', { count: view.unresolved.length })}
            </span>
          ) : null}
          {plan.unmatchedVideos.length ? (
            <span className="text-muted-foreground">
              {t('muxBatch.status.unmatchedVideos', { count: plan.unmatchedVideos.length })}
            </span>
          ) : null}
        </p>
      ) : null}
    </>
  )
}
