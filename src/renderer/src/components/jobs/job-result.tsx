import { AlertTriangle, CheckCircle2, FileCheck2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FailedLine, Job } from '@shared/ipc-contract'
import { formatTimecode, formatUsd } from '@renderer/lib/format'
import { JobError } from './job-error'
import { TermConsistency } from './term-consistency'

/** Terminal state: outputs, cost, untranslated lines and warnings, or the error. */
export function JobResult({ job }: { job: Job }): React.JSX.Element {
  const { t } = useTranslation()
  const r = job.result
  const failed =
    job.status === 'failed' || job.status === 'cancelled' || job.status === 'interrupted'
  const Icon = failed
    ? XCircle
    : job.status === 'completed-with-warnings'
      ? AlertTriangle
      : CheckCircle2
  const tone = failed
    ? 'text-destructive'
    : job.status === 'completed-with-warnings'
      ? 'text-warning'
      : 'text-success'

  return (
    <div className="grid gap-3">
      <p className={`flex items-center gap-2 text-sm font-medium ${tone}`}>
        <Icon className="size-4" />
        {t(`jobs.status.${job.status}`)}
      </p>
      <JobError job={job} />
      {r?.outputs.length ? (
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t('jobs.outputs')}</span>
          {r.outputs.map((o) => (
            <span key={o} className="flex items-center gap-2 text-sm break-all">
              <FileCheck2 className="size-4 shrink-0 text-success" />
              <span className="min-w-0">
                {o === r.subtitle ? (
                  <span className="mr-1.5 text-xs text-muted-foreground">
                    {t('jobs.subtitleFile')}
                  </span>
                ) : null}
                {o}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {r?.usage ? (
        <p className="text-xs text-muted-foreground">
          {t('jobs.finalCost', { value: formatUsd(r.usage.cost) })}
          {r.usage.costIncomplete ? ` · ${t('jobs.costIncomplete')}` : ''}
        </p>
      ) : null}
      {r?.failedLines?.length ? <FailedLines lines={r.failedLines} /> : null}
      {r?.consistency?.terms.length && !r.consistencyDismissed ? (
        <TermConsistency jobId={job.id} report={r.consistency} mediaTitle={job.media?.title} />
      ) : null}
      {r?.warnings.length ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t('jobs.warnings')}</summary>
          <ul className="mt-1 grid list-disc gap-0.5 pl-5">
            {r.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/** Lines left in the original language: where they are, why, and the original text. */
export function FailedLines({ lines }: { lines: readonly FailedLine[] }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <section className="grid gap-2" aria-label={t('jobs.untranslated', { count: lines.length })}>
      <p className="flex items-center gap-1.5 text-sm text-warning">
        <AlertTriangle className="size-4 shrink-0" />
        {t('jobs.untranslated', { count: lines.length })}
      </p>
      <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-md border bg-background/40 p-1.5">
        {lines.map((l) => (
          <li
            key={l.cueId}
            className="grid min-w-0 gap-0.5 rounded px-2 py-1.5 text-xs odd:bg-muted/40"
          >
            <span className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
              {l.location ? <span>{t('coverage.line', { line: l.location.line })}</span> : null}
              {l.location?.startMs !== undefined ? (
                <span>{formatTimecode(l.location.startMs)}</span>
              ) : null}
              <span className="text-warning">{t(`coverage.reason.${l.reason}`)}</span>
            </span>
            {l.excerpt ? (
              <code className="font-mono break-words whitespace-pre-wrap text-foreground/90">
                {l.excerpt}
              </code>
            ) : (
              <span className="text-muted-foreground">{t('jobs.noExcerpt', { id: l.cueId })}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
