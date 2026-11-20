import { useTranslation } from 'react-i18next'
import type { BatchPlan, BatchSource } from '@shared/ipc-contract'
import { Button } from '@renderer/components/ui/button'
import { PlanNotices, SourcePicker } from '@renderer/components/files/source-picker'
import { errorMessage } from '@renderer/i18n/error-message'
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
  const plan = flavor ? plans[flavor] : undefined
  const counts = {
    pipeline: plans.pipeline?.items.length ?? 0,
    translate: plans.translate?.items.length ?? 0
  }
  const empty = source && !plans.pending && !plans.error && counts.pipeline + counts.translate === 0

  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">{t('batch.files.body')}</p>
      <SourcePicker source={source} onSource={onSource} />

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

      {plan ? <PlanNotices plan={plan} /> : null}
      {identifying ? (
        <p className="text-sm text-muted-foreground">{t('batch.files.identifying')}</p>
      ) : null}
      {ctx ? <StatusLine ctx={ctx} /> : null}
    </>
  )
}
