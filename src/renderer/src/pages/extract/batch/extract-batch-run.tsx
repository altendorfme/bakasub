import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Job } from '@shared/ipc-contract'
import { StatusPill } from '@renderer/components/jobs/status-pill'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/tabs'
import { useBatch, useBatchAction } from '@renderer/data/batches'
import { isTerminal, useJobs } from '@renderer/data/jobs'
import { errorMessage } from '@renderer/i18n/error-message'
import { batchFraction, jobFraction } from '../../translate/batch/batch-progress'
import { extractCounts } from './extract-batch-progress'

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p
const pct = (f: number): number => Math.round(f * 100)

/** The batch just created: overall progress, counts per state, each file live. No cost step. */
export function ExtractBatchRun({
  id,
  onAnother
}: {
  id: string
  onAnother: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const jobs = (useJobs().data ?? []).filter((j) => j.batchId === id)
  const batch = useBatch(id).data
  const action = useBatchAction()
  if (!batch) return <p className="text-sm text-muted-foreground">{t('extractBatch.starting')}</p>

  const total = batch.total || jobs.length
  const finished = jobs.filter((j) => isTerminal(j.status)).length
  const done = jobs.length > 0 && finished === jobs.length
  const fraction = batchFraction(jobs)
  const c = extractCounts(jobs)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-5">
      <header className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-2">
        <h2 className="text-base font-semibold break-all">{batch.name}</h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t(done ? 'extractBatch.run.done' : 'extractBatch.run.running')}
        </p>
        <div className="flex items-center gap-3">
          <Progress
            value={fraction}
            className="h-2 flex-1"
            aria-label={t('extractBatch.run.progress', { done: finished, total })}
          />
          <span className="text-sm font-medium tabular-nums">{pct(fraction)}%</span>
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{t('extractBatch.run.progress', { done: finished, total })}</span>
          {(['queued', 'running', 'done', 'failed'] as const).map((k) =>
            c[k] ? (
              <span key={k} className={k === 'failed' ? 'text-destructive' : undefined}>
                {t(`extractBatch.run.count.${k}`, { count: c[k] })}
              </span>
            ) : null
          )}
        </p>
      </header>

      <section aria-labelledby="eb-run-files" className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <h3 id="eb-run-files" className="text-sm font-semibold">
          {t('batch.detail.files')}
        </h3>
        <ul className="grid grid-cols-[minmax(0,1fr)] min-w-0 divide-y rounded-lg border">
          {jobs.map((j) => (
            <li key={j.id} className="min-w-0">
              <FileRow job={j} />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {batch.state === 'active' ? (
          <Button
            variant="ghost"
            className="mr-auto text-destructive"
            disabled={action.isPending}
            onClick={() =>
              action.mutate(
                { id, action: 'cancel' },
                { onError: (err) => toast.error(errorMessage(err)) }
              )
            }
          >
            {t('batch.detail.cancelAll')}
          </Button>
        ) : null}
        <Button asChild>
          <Link to="/queue">{t('batch.detail.openQueue')}</Link>
        </Button>
        <Button variant="default" onClick={onAnother}>
          {t('extractBatch.run.another')}
        </Button>
      </div>
    </div>
  )
}

function FileRow({ job: j }: { job: Job }): React.JSX.Element {
  const { t } = useTranslation()
  const running = j.status === 'running'
  const f = jobFraction(j)
  return (
    <Link
      to="/queue"
      search={{ job: j.id }}
      className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-1.5 px-3 py-2.5 text-sm hover:bg-accent/60"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate" title={j.source}>
          {baseName(j.source)}
        </span>
        {running ? (
          <span className="shrink-0 text-xs text-primary tabular-nums">{pct(f)}%</span>
        ) : (
          <StatusPill status={j.status} />
        )}
      </span>
      {running ? (
        <span className="text-xs text-muted-foreground">
          {j.step ? t(`jobs.step.${j.step}`) : t('jobs.status.running')}
        </span>
      ) : null}
      {running ? <Progress value={f} className="h-1" aria-label={baseName(j.source)} /> : null}
    </Link>
  )
}
