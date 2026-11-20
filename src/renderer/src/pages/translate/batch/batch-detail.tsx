import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { StatusPill } from '@renderer/components/jobs/status-pill'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/tabs'
import { useBatch, useBatchAction } from '@renderer/data/batches'
import { isTerminal, useJobs } from '@renderer/data/jobs'
import { errorMessage } from '@renderer/i18n/error-message'
import { formatUsd } from '@renderer/lib/format'

/** The batch just created: overall progress, total cost to confirm, cancel all, its files. */
export function BatchDetail({
  id,
  onAnother
}: {
  id: string
  onAnother: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const batch = useBatch(id).data
  const jobs = (useJobs().data ?? []).filter((j) => j.batchId === id)
  const action = useBatchAction()
  const act = (a: 'confirm' | 'cancel'): void =>
    action.mutate({ id, action: a }, { onError: (err) => toast.error(errorMessage(err)) })

  if (!batch) return <p className="text-sm text-muted-foreground">{t('batch.starting')}</p>
  const done = jobs.filter((j) => isTerminal(j.status)).length
  const total = batch.total || jobs.length
  const pf = batch.preflight

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold break-all">{batch.name}</h2>
        <p className="text-sm text-muted-foreground">
          {t('batch.detail.progress', { done, total })}
        </p>
        <Progress value={total ? done / total : 0} className="h-1.5" />
      </div>

      {pf && pf.awaiting > 0 ? (
        <section className="grid gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <p>{t('batch.detail.awaiting', { count: pf.awaiting })}</p>
          <p className="text-muted-foreground">
            {pf.cost
              ? t('batch.detail.cost', {
                  low: formatUsd(pf.cost.low),
                  high: formatUsd(pf.cost.high)
                })
              : t('batch.detail.costUnknown')}
          </p>
          <div>
            <Button variant="default" disabled={action.isPending} onClick={() => act('confirm')}>
              {t('batch.detail.confirmAll')}
            </Button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="batch-files" className="grid gap-2">
        <h3 id="batch-files" className="text-sm font-semibold">
          {t('batch.detail.files')}
        </h3>
        <ul className="grid divide-y rounded-lg border">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link
                to="/queue"
                search={{ job: j.id }}
                className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm hover:bg-accent/60"
              >
                <span className="min-w-0 flex-1 truncate" title={j.source}>
                  {j.source.split(/[\\/]/).pop()}
                </span>
                {j.media ? (
                  <span className="truncate text-xs text-violet">{j.media.title}</span>
                ) : null}
                <StatusPill status={j.status} />
              </Link>
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
