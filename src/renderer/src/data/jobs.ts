import { useEffect } from 'react'
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { Job, JobProgressEvent } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

export const useJobs = (): UseQueryResult<Job[]> =>
  useQuery({ queryKey: qk.jobs.list(), queryFn: () => unwrap(window.api.jobs.list()) })

/**
 * Patches a `jobs:progress` event into the cache (list + detail). Returns `false` when the job
 * is not cached (created elsewhere, e.g. by a batch): the caller refetches the list instead.
 */
export function applyJobProgress(qc: QueryClient, e: JobProgressEvent): boolean {
  const patch = (j: Job): Job => ({
    ...j,
    status: e.status,
    step: e.progress.step,
    progress: e.progress
  })
  let found = false
  qc.setQueryData<Job[]>(qk.jobs.list(), (list) =>
    list?.map((j) => {
      if (j.id !== e.id) return j
      found = true
      return patch(j)
    })
  )
  qc.setQueryData<Job>(qk.jobs.detail(e.id), (j) => (j ? patch(j) : j))
  return found
}

/**
 * Subscribes once (app root) to `jobs:progress`. Terminal states also refetch the job, since the
 * event does not carry `result`/`error`.
 */
export function useJobEvents(qc: QueryClient): void {
  useEffect(
    () =>
      window.api.events.on('jobs:progress', (e) => {
        const known = applyJobProgress(qc, e)
        const terminal = !['queued', 'running', 'awaiting-confirmation'].includes(e.status)
        if (!known) void qc.invalidateQueries({ queryKey: qk.jobs.list() })
        else if (terminal) void qc.invalidateQueries({ queryKey: qk.jobs.all })
      }),
    [qc]
  )
}

export function jobCounts(jobs: readonly Job[] | undefined): {
  running: number
  queued: number
  awaiting: number
} {
  const c = { running: 0, queued: 0, awaiting: 0 }
  for (const j of jobs ?? []) {
    if (j.status === 'running') c.running++
    else if (j.status === 'queued') c.queued++
    else if (j.status === 'awaiting-confirmation') c.awaiting++
  }
  return c
}
