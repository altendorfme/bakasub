import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Job } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Tooltip } from '@renderer/components/ui/popover'
import {
  ACTIVE_STATUSES,
  isTerminal,
  RETRYABLE_STATUSES,
  useJob,
  useJobAction,
  usePreflight,
  useRemoveJob,
  type JobAction
} from '@renderer/data/jobs'
import { errorMessage } from '@renderer/i18n/error-message'
import { episodeCode } from '@renderer/lib/episode'
import { JobProgress } from './job-progress'
import { JobResult } from './job-result'
import { PreflightReview } from './preflight-review'

/** The "do it again" label of the wizard that created the job. */
const ANOTHER_LABEL = {
  extract: 'extractPage.another',
  mux: 'muxPage.another',
  translate: 'translate.another',
  pipeline: 'translate.another'
} as const satisfies Record<Job['kind'], string>

const when = (iso: string, lang: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(d)
}

/**
 * One job, whatever its state: preflight review (confirm/cancel), live progress, or the result.
 * Used by the wizard (after creating) and by the queue inspector.
 */
export function JobDetail({
  id,
  onAnother,
  onRemoved,
  showQueueLink = false
}: {
  id: string
  /** Wizard: "Translate/Extract/Mux another…" once the job is over (label follows `job.kind`). */
  onAnother?: () => void
  onRemoved?: () => void
  showQueueLink?: boolean
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const job = useJob(id).data
  const waiting = job?.status === 'awaiting-confirmation'
  const preflight = usePreflight(id, waiting)
  const action = useJobAction()
  const remove = useRemoveJob()
  const act = (a: JobAction): void =>
    action.mutate({ id, action: a }, { onError: (err) => toast.error(errorMessage(err)) })

  if (!job) return <p className="text-sm text-muted-foreground">{t('translate.starting')}</p>
  const active = ACTIVE_STATUSES.has(job.status)
  const busy = action.isPending || remove.isPending

  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        {job.media ? (
          <p className="text-sm text-violet">
            {job.media.title}
            {job.media.year ? ` (${job.media.year})` : ''}
            {job.media.episode
              ? ` · ${episodeCode(job.media.episode.season, job.media.episode.episode)}${job.media.episode.title ? `: ${job.media.episode.title}` : ''}`
              : ''}
          </p>
        ) : null}
        <h2 className="text-base font-semibold break-all">{job.source}</h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge tone="violet">{t(`jobs.kind.${job.kind}`)}</Badge>
          {job.batchId ? <Badge>{t('jobs.batch')}</Badge> : null}
          <span>{t(`jobs.status.${job.status}`)}</span>
          {job.attempt > 1 ? <span>{t('jobs.attempt', { n: job.attempt })}</span> : null}
          <span>{t('jobs.created', { when: when(job.createdAt, i18n.language) })}</span>
          {job.finishedAt ? (
            <span>{t('jobs.finished', { when: when(job.finishedAt, i18n.language) })}</span>
          ) : null}
        </p>
      </header>

      {waiting ? (
        preflight.data ? (
          <PreflightReview estimate={preflight.data.estimate} coverage={preflight.data.coverage} />
        ) : (
          <p className="text-sm text-muted-foreground">{t('translate.starting')}</p>
        )
      ) : active ? (
        <JobProgress job={job} />
      ) : (
        <JobResult job={job} />
      )}

      <JobActions
        job={job}
        busy={busy}
        canConfirm={!!preflight.data}
        onAct={act}
        onRemove={() =>
          remove.mutate(id, {
            onSuccess: onRemoved,
            onError: (err) => toast.error(errorMessage(err))
          })
        }
        onAnother={onAnother}
        showQueueLink={showQueueLink}
      />
    </div>
  )
}

function JobActions({
  job,
  busy,
  canConfirm,
  onAct,
  onRemove,
  onAnother,
  showQueueLink
}: {
  job: Job
  busy: boolean
  canConfirm: boolean
  onAct: (a: JobAction) => void
  onRemove: () => void
  onAnother?: () => void
  showQueueLink: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const waiting = job.status === 'awaiting-confirmation'
  const active = ACTIVE_STATUSES.has(job.status)
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      <Button variant="ghost" asChild className={showQueueLink ? '' : 'mr-auto'}>
        <Link to="/logs" search={{ job: job.id }}>
          {t('jobs.logs')}
        </Link>
      </Button>
      {showQueueLink ? (
        <Button variant="ghost" asChild className="mr-auto">
          <Link to="/queue" search={{ job: job.id }}>
            {t('jobs.openQueue')}
          </Link>
        </Button>
      ) : null}
      {waiting || active ? (
        <Tooltip content={t('jobs.cancelHint')}>
          <Button variant="destructive" disabled={busy} onClick={() => onAct('cancel')}>
            {t('jobs.cancel')}
          </Button>
        </Tooltip>
      ) : null}
      {isTerminal(job.status) && !onAnother ? (
        <Button variant="ghost" disabled={busy} onClick={onRemove}>
          {t('jobs.remove')}
        </Button>
      ) : null}
      {RETRYABLE_STATUSES.has(job.status) ? (
        <Button disabled={busy} onClick={() => onAct('retry')}>
          {t('jobs.retry')}
        </Button>
      ) : null}
      {waiting ? (
        <Button variant="default" disabled={busy || !canConfirm} onClick={() => onAct('confirm')}>
          {t('jobs.confirm')}
        </Button>
      ) : null}
      {onAnother && isTerminal(job.status) ? (
        <Button variant="default" onClick={onAnother}>
          {t(ANOTHER_LABEL[job.kind])}
        </Button>
      ) : null}
    </div>
  )
}
