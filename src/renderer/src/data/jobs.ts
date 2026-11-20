import { useEffect } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  CoverageReport,
  Job,
  JobCreateRequest,
  JobProgressEvent,
  PreflightEstimate
} from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

export const useJobs = (): UseQueryResult<Job[]> =>
  useQuery({ queryKey: qk.jobs.list(), queryFn: () => unwrap(window.api.jobs.list()) })

/** Live through `jobs:progress` (patched into this cache by `useJobEvents`). */
export const useJob = (id: string | null): UseQueryResult<Job> =>
  useQuery({
    queryKey: qk.jobs.detail(id ?? ''),
    queryFn: () => unwrap(window.api.jobs.get(id!)),
    enabled: id !== null
  })

/** Estimate + full coverage of a job waiting for confirmation. */
export const usePreflight = (
  id: string,
  enabled: boolean
): UseQueryResult<{ estimate: PreflightEstimate; coverage: CoverageReport } | null> =>
  useQuery({
    queryKey: qk.jobs.preflight(id),
    queryFn: () => unwrap(window.api.jobs.preflight(id)),
    enabled
  })

export function useCreateJob(): UseMutationResult<Job, Error, JobCreateRequest> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req) => unwrap(window.api.jobs.create(req)),
    onSuccess: (job) => {
      qc.setQueryData(qk.jobs.detail(job.id), job)
      qc.setQueryData<Job[]>(qk.jobs.list(), (list) => (list ? [job, ...list] : list))
    }
  })
}

export type JobAction = 'confirm' | 'cancel' | 'retry'

/** Confirm / cancel / retry: the Main answers with the updated job. */
export function useJobAction(): UseMutationResult<Job, Error, { id: string; action: JobAction }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }) => unwrap(window.api.jobs[action](id)),
    onSuccess: (job) => {
      qc.setQueryData(qk.jobs.detail(job.id), job)
      qc.setQueryData<Job[]>(qk.jobs.list(), (list) =>
        list?.map((j) => (j.id === job.id ? job : j))
      )
    }
  })
}

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

/** Terminal jobs only (the Main refuses the rest with `JOB_INVALID_STATE`). */
export function useRemoveJob(): UseMutationResult<{ removed: true }, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => unwrap(window.api.jobs.remove(id)),
    onSuccess: (_r, id) => {
      qc.setQueryData<Job[]>(qk.jobs.list(), (list) => list?.filter((j) => j.id !== id))
      qc.removeQueries({ queryKey: qk.jobs.detail(id) })
    }
  })
}

export const ACTIVE_STATUSES: ReadonlySet<Job['status']> = new Set(['queued', 'running'])
export const RETRYABLE_STATUSES: ReadonlySet<Job['status']> = new Set([
  'failed',
  'cancelled',
  'interrupted'
])
export const isTerminal = (s: Job['status']): boolean =>
  !ACTIVE_STATUSES.has(s) && s !== 'awaiting-confirmation'

export type QueueFilter = 'all' | 'active' | 'attention' | 'done'

/** Queue tabs. "Needs you": waiting for confirmation, failed or interrupted. */
export function matchesFilter(j: Job, f: QueueFilter): boolean {
  switch (f) {
    case 'all':
      return true
    case 'active':
      return ACTIVE_STATUSES.has(j.status)
    case 'attention':
      return (
        j.status === 'awaiting-confirmation' || j.status === 'failed' || j.status === 'interrupted'
      )
    case 'done':
      return (
        j.status === 'completed' ||
        j.status === 'completed-with-warnings' ||
        j.status === 'cancelled'
      )
  }
}

/** Renderer start: "this session" = jobs created since BakaSub opened. */
const SESSION_START = Date.now()

/** Spent in this session: final cost of finished jobs, cost so far of running ones. */
export function sessionCost(jobs: readonly Job[] | undefined, since = SESSION_START): number {
  return (jobs ?? [])
    .filter((j) => Date.parse(j.createdAt) >= since)
    .reduce((sum, j) => sum + (j.result?.usage?.cost ?? j.progress.cost ?? 0), 0)
}

/** Latest lane cooldown among running jobs (a 429 pauses every job on that lane). */
export function cooldownUntil(jobs: readonly Job[] | undefined): number | undefined {
  const until = (jobs ?? [])
    .map((j) => (j.progress.waiting?.reason === 'cooldown' ? j.progress.waiting.untilMs : 0))
    .reduce((a, b) => Math.max(a, b), 0)
  return until > Date.now() ? until : undefined
}
