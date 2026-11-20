import { useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { BrushCleaning, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Job } from '@shared/ipc-contract'
import { WaitLabel } from '@renderer/components/common/wait-label'
import { ResizableAside } from '@renderer/components/common/resizable-aside'
import { JobDetail } from '@renderer/components/jobs/job-detail'
import { Backdrop } from '@renderer/components/media/backdrop'
import { Button } from '@renderer/components/ui/button'
import { Tooltip } from '@renderer/components/ui/popover'
import { Progress } from '@renderer/components/ui/tabs'
import {
  matchesFilter,
  useClearCompletedJobs,
  useJobs,
  type QueueFilter
} from '@renderer/data/jobs'
import { errorMessage } from '@renderer/i18n/error-message'
import { episodeCode } from '@renderer/lib/episode'
import { formatUsd } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { StatusPill } from '@renderer/components/jobs/status-pill'

const FILTERS: readonly QueueFilter[] = ['all', 'active', 'attention', 'done']

const costOf = (j: Job): number | undefined => j.result?.usage?.cost ?? j.progress.cost

/** Workspace queue: filterable list on the left, the selected job (`?job=`) on the right. */
export function QueuePage(): React.JSX.Element {
  const { t } = useTranslation()
  const jobs = useJobs().data ?? []
  const { job: selected } = useSearch({ from: '/shell/queue' })
  const navigate = useNavigate({ from: '/queue' })
  const [filter, setFilter] = useState<QueueFilter>('all')
  const list = jobs.filter((j) => matchesFilter(j, filter))
  const current = jobs.find((j) => j.id === selected)
  const select = (id: string | undefined): void =>
    void navigate({ search: { job: id }, replace: true })
  const clear = useClearCompletedJobs()
  const doneCount = jobs.filter((j) => matchesFilter(j, 'done')).length
  const clearDone = (): void =>
    clear.mutate(undefined, {
      onSuccess: ({ removed }) => {
        if (current && removed.includes(current.id)) select(undefined)
        toast.success(t('queue.cleared', { count: removed.length }))
      },
      onError: (e) => toast.error(errorMessage(e))
    })

  return (
    <div className="flex h-full min-h-0">
      <ResizableAside storageKey="queue.listWidth">
        <div className="grid gap-3 border-b p-3">
          <div className="flex gap-2">
            <Button variant="default" className="flex-1" asChild>
              <Link to="/translate">
                <Plus />
                {t('queue.new')}
              </Link>
            </Button>
            <Tooltip content={t('queue.clearDoneHint')}>
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                aria-label={t('queue.clearDone')}
                disabled={doneCount === 0 || clear.isPending}
                onClick={clearDone}
              >
                <BrushCleaning />
              </Button>
            </Tooltip>
          </div>
          <div className="flex flex-wrap gap-1 text-xs" role="tablist" aria-label={t('queue.list')}>
            {FILTERS.map((f) => {
              const count = jobs.filter((j) => matchesFilter(j, f)).length
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-md px-2 py-1 whitespace-nowrap',
                    filter === f
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`queue.filters.${f}`)}
                  {count > 0 && f !== 'all' ? (
                    <span className={cn('ml-1', f === 'attention' && 'text-warning')}>{count}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
        {list.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t(`queue.empty.${filter}`)}</p>
        ) : (
          <ul className="flex-1 divide-y overflow-y-auto" aria-label={t('queue.list')}>
            {list.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  aria-current={j.id === selected ? 'true' : undefined}
                  onClick={() => select(j.id)}
                  className={cn(
                    'grid w-full min-w-0 gap-1.5 px-3 py-2.5 text-left',
                    j.id === selected ? 'bg-primary-soft/50' : 'hover:bg-accent/60'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={j.source}>
                      {j.source}
                    </span>
                    <StatusPill status={j.status} />
                  </span>
                  {j.media ? (
                    <span className="truncate text-xs text-violet">
                      {j.media.title}
                      {j.media.episode
                        ? ` · ${episodeCode(j.media.episode.season, j.media.episode.episode)}`
                        : ''}
                    </span>
                  ) : null}
                  {j.status === 'running' ? (
                    <>
                      <Progress
                        className="h-1"
                        value={
                          j.progress.translation?.total
                            ? j.progress.translation.done / j.progress.translation.total
                            : j.progress.stepFraction
                        }
                      />
                      {j.progress.waiting ? <WaitLabel waiting={j.progress.waiting} /> : null}
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {t(`jobs.kind.${j.kind}`)}
                      {costOf(j) !== undefined ? ` · US$ ${formatUsd(costOf(j)!)}` : ''}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ResizableAside>
      <section className="relative min-w-0 flex-1 overflow-y-auto">
        <Backdrop url={current?.media?.backdropUrl} />
        {current ? (
          <div className="relative mx-auto max-w-3xl p-6">
            <div className="rounded-xl border bg-card/92 p-5">
              <JobDetail key={current.id} id={current.id} onRemoved={() => select(undefined)} />
            </div>
          </div>
        ) : (
          <p className="p-8 text-sm text-muted-foreground">{t('queue.select')}</p>
        )}
      </section>
    </div>
  )
}
