import type { Job, JobStep } from '@shared/ipc-contract'
import { isTerminal } from '@renderer/data/jobs'

/**
 * Rough share of a job's wall time per step: translation dominates; extracting a big remux is
 * the next longest. Steps a kind does not run are left out and the rest renormalized.
 */
const WEIGHT: Record<JobStep, number> = {
  probe: 2,
  extract: 15,
  preflight: 3,
  translate: 68,
  validate: 2,
  write: 3,
  mux: 7
}

const STEPS_OF: Record<Job['kind'], readonly JobStep[]> = {
  pipeline: ['probe', 'extract', 'preflight', 'translate', 'validate', 'write', 'mux'],
  translate: ['preflight', 'translate', 'validate', 'write'],
  extract: ['probe', 'extract', 'write'],
  mux: ['mux']
}

/** 0..1 for one job: finished = 1; awaiting confirmation = everything up to the preflight. */
export function jobFraction(j: Job): number {
  if (isTerminal(j.status)) return 1
  if (j.status === 'queued') return 0
  const steps = STEPS_OF[j.kind]
  const total = steps.reduce((n, s) => n + WEIGHT[s], 0)
  const upTo = (i: number): number => steps.slice(0, i).reduce((n, s) => n + WEIGHT[s], 0)
  if (j.status === 'awaiting-confirmation') {
    const i = steps.indexOf('preflight')
    return i === -1 ? 0 : upTo(i + 1) / total
  }
  const i = j.step ? steps.indexOf(j.step) : -1
  if (i === -1) return 0
  const p = j.progress
  const tr = p.translation
  const inStep = j.step === 'translate' && tr && tr.total > 0 ? tr.done / tr.total : p.stepFraction
  return (upTo(i) + WEIGHT[steps[i]] * Math.min(1, Math.max(0, inStep ?? 0))) / total
}

export const batchFraction = (jobs: readonly Job[]): number =>
  jobs.length ? jobs.reduce((n, j) => n + jobFraction(j), 0) / jobs.length : 0

/** Before the cost is known: queued, or running a step that comes before the translation. */
const PRE_TRANSLATION: ReadonlySet<JobStep | null> = new Set([
  null,
  'probe',
  'extract',
  'preflight'
])
const estimating = (j: Job): boolean =>
  j.status === 'queued' || (j.status === 'running' && PRE_TRANSLATION.has(j.step))

/**
 * Where the batch is, as the step bar shows it after "Start":
 * - `review`: some file still being prepared/estimated or waiting for the user's OK;
 * - `run`: every file confirmed (translating or done);
 * - `done`: every file finished.
 */
export type BatchPhase = 'review' | 'run' | 'done'

export function batchPhase(jobs: readonly Job[]): BatchPhase {
  if (jobs.length && jobs.every((j) => isTerminal(j.status))) return 'done'
  // Only files that will stop for confirmation hold the batch in review.
  if (jobs.some((j) => j.status === 'awaiting-confirmation')) return 'review'
  if (jobs.some((j) => j.progress.translation || isTerminal(j.status))) return 'run'
  return jobs.some(estimating) ? 'review' : 'run'
}

export interface BatchCounts {
  estimating: number
  awaiting: number
  translating: number
  done: number
  failed: number
}

export function batchCounts(jobs: readonly Job[]): BatchCounts {
  const c: BatchCounts = { estimating: 0, awaiting: 0, translating: 0, done: 0, failed: 0 }
  for (const j of jobs) {
    if (j.status === 'awaiting-confirmation') c.awaiting++
    else if (estimating(j)) c.estimating++
    else if (j.status === 'running') c.translating++
    else if (j.status === 'completed' || j.status === 'completed-with-warnings') c.done++
    else c.failed++
  }
  return c
}
