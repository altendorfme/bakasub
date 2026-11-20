import { useTranslation } from 'react-i18next'
import type { Job } from '@shared/ipc-contract'
import { WaitLabel } from '@renderer/components/common/wait-label'
import { Progress } from '@renderer/components/ui/tabs'
import { formatUsd } from '@renderer/lib/format'

/** Step, translated lines, cache hits, current part, cost so far, and any wait. */
export function JobProgress({ job }: { job: Job }): React.JSX.Element {
  const { t } = useTranslation()
  const p = job.progress
  const tr = p.translation
  const fraction = tr && tr.total > 0 ? tr.done / tr.total : p.stepFraction
  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">
          {job.status === 'queued'
            ? t('jobs.status.queued')
            : p.step
              ? t(`jobs.step.${p.step}`)
              : t('jobs.status.running')}
        </span>
        {tr ? (
          <span className="text-muted-foreground">
            {t('jobs.lines', { done: tr.done, total: tr.total })}
            {tr.chunk ? ` · ${t('jobs.chunk', tr.chunk)}` : ''}
          </span>
        ) : null}
        {p.cost ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {t('jobs.cost', { value: formatUsd(p.cost) })}
          </span>
        ) : null}
      </div>
      <Progress
        value={job.status === 'queued' ? 0 : fraction}
        aria-label={t('jobs.status.running')}
      />
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {tr && tr.cached > 0 ? <span>{t('jobs.cached', { count: tr.cached })}</span> : null}
        {p.waiting ? <WaitLabel waiting={p.waiting} /> : null}
      </div>
    </div>
  )
}
