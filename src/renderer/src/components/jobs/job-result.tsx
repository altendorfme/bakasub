import { AlertTriangle, CheckCircle2, FileCheck2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Job } from '@shared/ipc-contract'
import { formatUsd } from '@renderer/lib/format'
import { JobError } from './job-error'

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
              {o}
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
      {r?.failedLines?.length ? (
        <p className="text-sm text-warning">
          {t('jobs.untranslated', { count: r.failedLines.length })}
        </p>
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
