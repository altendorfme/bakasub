import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { Job } from '@shared/ipc-contract'
import { jobCounts, useJobs } from '@renderer/data/jobs'
import { useApiKeyStatus } from '@renderer/data/settings'
import { useSidecarReport } from '@renderer/data/sidecars'
import { cooldownUntil, sessionCost } from '@renderer/data/jobs'
import { formatUsd } from '@renderer/lib/format'
import { useCountdown } from '@renderer/lib/use-countdown'
import { cn } from '@renderer/lib/utils'

function Cooldown({ until }: { until: number }): React.JSX.Element | null {
  const { t } = useTranslation()
  const seconds = useCountdown(until)
  if (!seconds) return null
  return <span className="text-warning">{t('status.cooldown', { seconds })}</span>
}

/** 0..1 for a running job: translation lines when known, else the step fraction. */
function jobFraction(j: Job): number {
  const tr = j.progress.translation
  if (tr && tr.total > 0) return tr.done / tr.total
  return j.progress.stepFraction ?? 0
}

function Dot({ tone }: { tone: 'ok' | 'bad' | 'idle' }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        'size-1.5 rounded-full',
        tone === 'ok' ? 'bg-success' : tone === 'bad' ? 'bg-warning' : 'bg-muted-foreground/50'
      )}
    />
  )
}

export function StatusBar(): React.JSX.Element {
  const { t } = useTranslation()
  const jobs = useJobs().data
  const counts = jobCounts(jobs)
  const running = jobs?.filter((j) => j.status === 'running') ?? []
  const avg = running.length ? running.reduce((s, j) => s + jobFraction(j), 0) / running.length : 0
  const tools = useSidecarReport()
  const apiKey = useApiKeyStatus()
  const cost = sessionCost(jobs)
  const cooldown = cooldownUntil(jobs)

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t bg-card px-3 text-xs text-muted-foreground">
      <Link to="/queue" className="flex items-center gap-2 hover:text-foreground">
        <span
          aria-hidden
          className={cn(
            'size-2 rounded-full',
            counts.running ? 'animate-pulse bg-primary' : 'bg-muted-foreground/50'
          )}
        />
        <span>
          {t('status.running', { count: counts.running })} ·{' '}
          {t('status.queued', { count: counts.queued })}
        </span>
        {counts.awaiting > 0 && (
          <span className="text-warning">· {t('status.awaiting', { count: counts.awaiting })}</span>
        )}
      </Link>
      {running.length > 0 && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(avg * 100)}
          className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
        >
          <div className="bg-brand h-full transition-all" style={{ width: `${avg * 100}%` }} />
        </div>
      )}
      {cooldown ? <Cooldown until={cooldown} /> : null}
      {cost > 0 ? <span>{t('status.sessionCost', { value: formatUsd(cost) })}</span> : null}
      <span className="ml-auto flex items-center gap-1.5">
        <Dot tone={tools.data ? (tools.data.ready ? 'ok' : 'bad') : 'idle'} />
        {tools.data
          ? t(tools.data.ready ? 'status.tools.ok' : 'status.tools.missing')
          : t('status.tools.checking')}
      </span>
      {apiKey.data && (
        <span className="flex items-center gap-1.5">
          <Dot tone={apiKey.data.present ? 'ok' : 'bad'} />
          {t(apiKey.data.present ? 'status.apiKey.set' : 'status.apiKey.missing')}
        </span>
      )}
    </footer>
  )
}
