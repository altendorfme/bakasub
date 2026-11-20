import type { Job } from '@shared/ipc-contract'

export interface JobCounts {
  queued: number
  running: number
  done: number
  /** Failed, cancelled or interrupted. */
  failed: number
}

export function jobCounts(jobs: readonly Job[]): JobCounts {
  const c: JobCounts = { queued: 0, running: 0, done: 0, failed: 0 }
  for (const j of jobs) {
    if (j.status === 'queued' || j.status === 'awaiting-confirmation') c.queued++
    else if (j.status === 'running') c.running++
    else if (j.status === 'completed' || j.status === 'completed-with-warnings') c.done++
    else c.failed++
  }
  return c
}
