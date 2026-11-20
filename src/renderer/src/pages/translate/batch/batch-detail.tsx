import { Link } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { AlertTriangle, Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Batch, Job } from '@shared/ipc-contract'
import { StatusPill } from '@renderer/components/jobs/status-pill'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/tabs'
import { useBatch, useBatchAction } from '@renderer/data/batches'
import { isTerminal, useJobs } from '@renderer/data/jobs'
import { errorMessage } from '@renderer/i18n/error-message'
import { formatInt, formatUsd } from '@renderer/lib/format'
import { StepBar } from '../step-bar'
import {
  batchCounts,
  batchFraction,
  batchPhase,
  jobFraction,
  type BatchPhase
} from './batch-progress'
import type { BatchStep } from './batch-state'

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p
const pct = (f: number): number => Math.round(f * 100)

type RunStep = BatchStep | 'review' | 'run'

/**
 * After "Start": the wizard's step bar goes on with "Review cost" and "Translation" (driven by
 * the jobs), and the card shows the batch.
 */
export function BatchRun({
  id,
  steps,
  onAnother
}: {
  id: string
  steps: readonly BatchStep[]
  onAnother: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const jobs = (useJobs().data ?? []).filter((j) => j.batchId === id)
  const phase = batchPhase(jobs)
  const all: RunStep[] = [...steps, 'review', 'run']
  const current: RunStep = phase === 'review' ? 'review' : 'run'
  return (
    <>
      <StepBar
        steps={all}
        current={current}
        label={(s) => t(`batch.steps.${s}`)}
        done={(s) => s !== current || phase === 'done'}
        reachable={() => false}
        onGo={() => undefined}
      />
      <section className="mx-auto grid grid-cols-[minmax(0,1fr)] w-full max-w-3xl min-w-0 rounded-xl border bg-card/92 p-5">
        <BatchDetail id={id} jobs={jobs} phase={phase} onAnother={onAnother} />
      </section>
    </>
  )
}

/** The batch just created: phase, overall progress, the cost review, then each file live. */
export function BatchDetail({
  id,
  jobs,
  phase,
  onAnother
}: {
  id: string
  jobs: readonly Job[]
  phase: BatchPhase
  onAnother: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const batch = useBatch(id).data
  const action = useBatchAction()
  const act = (a: 'confirm' | 'cancel'): void =>
    action.mutate({ id, action: a }, { onError: (err) => toast.error(errorMessage(err)) })

  if (!batch) return <p className="text-sm text-muted-foreground">{t('batch.starting')}</p>
  const total = batch.total || jobs.length
  const c = batchCounts(jobs)
  const fraction = batchFraction(jobs)
  const finished = jobs.filter((j) => isTerminal(j.status)).length
  const awaiting = jobs.filter((j) => j.status === 'awaiting-confirmation')

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-5">
      <header className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-2">
        <h2 className="text-base font-semibold break-all">{batch.name}</h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t(`batch.detail.phase.${awaiting.length ? 'awaiting' : phase}`)}
        </p>
        <div className="flex items-center gap-3">
          <Progress
            value={fraction}
            className="h-2 flex-1"
            aria-label={t('batch.detail.progress', { done: finished, total })}
          />
          <span className="text-sm font-medium tabular-nums">{pct(fraction)}%</span>
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{t('batch.detail.progress', { done: finished, total })}</span>
          {(['estimating', 'awaiting', 'translating', 'failed'] as const).map((k) =>
            c[k] ? (
              <span key={k} className={k === 'failed' ? 'text-destructive' : undefined}>
                {t(`batch.detail.count.${k}`, { count: c[k] })}
              </span>
            ) : null
          )}
        </p>
      </header>

      {awaiting.length ? (
        <CostReview
          batch={batch}
          awaiting={awaiting}
          estimating={c.estimating}
          busy={action.isPending}
          onConfirm={() => act('confirm')}
        />
      ) : null}

      <section
        aria-labelledby="batch-files"
        className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-2"
      >
        <h3 id="batch-files" className="text-sm font-semibold">
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
            onClick={() => act('cancel')}
          >
            {t('batch.detail.cancelAll')}
          </Button>
        ) : null}
        <Button asChild>
          <Link to="/queue">{t('batch.detail.openQueue')}</Link>
        </Button>
        <Button variant="default" onClick={onAnother}>
          {t('batch.detail.another')}
        </Button>
      </div>
    </div>
  )
}

/** The preflight of every file waiting for the user: lines, cache, cost, and the total. */
function CostReview({
  batch,
  awaiting,
  estimating,
  busy,
  onConfirm
}: {
  batch: Batch
  awaiting: readonly Job[]
  estimating: number
  busy: boolean
  onConfirm: () => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const pf = batch.preflight
  const shortQuota = awaiting.some((j) => j.result?.preflight?.freeQuota?.enough === false)
  return (
    <section
      aria-labelledby="batch-review"
      className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-3 rounded-lg border border-primary/40 bg-primary-soft/20 p-4"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
        <h3 id="batch-review" className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="size-4 text-primary" />
          {t('batch.review.heading')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('batch.detail.awaiting', { count: awaiting.length })} {t('batch.review.body')}
        </p>
      </div>

      <ul className="grid grid-cols-[minmax(0,1fr)] min-w-0 gap-1 text-sm">
        {awaiting.map((j) => {
          const e = j.result?.preflight
          return (
            <li
              key={j.id}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-md bg-background/40 px-3 py-2"
            >
              <span className="truncate" title={j.source}>
                {baseName(j.source)}
              </span>
              <span className="text-right font-medium tabular-nums">
                {e ? costLabel(e, t) : '—'}
              </span>
              <span className="col-span-2 text-xs text-muted-foreground">
                {e
                  ? [
                      t('batch.review.lines', {
                        count: e.lines.toTranslate,
                        n: formatInt(e.lines.toTranslate, i18n.language)
                      }),
                      e.lines.cached > 0
                        ? t('preflight.cachedLines', { count: e.lines.cached })
                        : null,
                      t('preflight.parts', { count: e.lines.chunks })
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : t('batch.review.noEstimate')}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-primary/20 pt-3">
        <p className="text-sm">
          {pf?.cost
            ? t('batch.detail.cost', {
                low: formatUsd(pf.cost.low),
                high: formatUsd(pf.cost.high)
              })
            : t('batch.detail.costUnknown')}
          {pf?.approximate ? (
            <span className="text-xs text-muted-foreground"> · {t('batch.review.approx')}</span>
          ) : null}
        </p>
        <Button variant="default" className="ml-auto" disabled={busy} onClick={onConfirm}>
          {t('batch.detail.confirmAll')}
        </Button>
      </div>
      {shortQuota ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertTriangle className="size-3.5 shrink-0" />
          {t('batch.review.quota')}
        </p>
      ) : null}
      {estimating > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('batch.review.pending', { count: estimating })}
        </p>
      ) : null}
    </section>
  )
}

function costLabel(e: NonNullable<NonNullable<Job['result']>['preflight']>, t: TFunction): string {
  const free = e.model.pricing?.prompt === 0 && e.model.pricing.completion === 0
  if (e.lines.toTranslate === 0) return t('batch.review.nothing')
  if (free) return t('preflight.free')
  return e.cost
    ? t('preflight.costRange', { low: formatUsd(e.cost.low), high: formatUsd(e.cost.high) })
    : t('batch.review.dynamic')
}

/** One file: name, work, and either its live step + progress or its final state. */
function FileRow({ job: j }: { job: Job }): React.JSX.Element {
  const { t } = useTranslation()
  const running = j.status === 'running'
  const f = jobFraction(j)
  const failed = j.result?.failedLines?.length ?? 0
  const cost = j.result?.usage?.cost ?? j.progress.cost
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
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {j.media ? <span className="max-w-full truncate text-violet">{j.media.title}</span> : null}
        {running ? (
          <span>{j.step ? t(`jobs.step.${j.step}`) : t('jobs.status.running')}</span>
        ) : null}
        {running && j.progress.translation ? (
          <span>
            {t('jobs.lines', {
              done: j.progress.translation.done,
              total: j.progress.translation.total
            })}
          </span>
        ) : null}
        {cost ? (
          <span>
            {t(j.result?.usage ? 'jobs.finalCost' : 'jobs.cost', { value: formatUsd(cost) })}
          </span>
        ) : null}
        {failed ? (
          <span className="text-warning">{t('jobs.untranslated', { count: failed })}</span>
        ) : null}
      </span>
      {running ? <Progress value={f} className="h-1" aria-label={baseName(j.source)} /> : null}
    </Link>
  )
}
