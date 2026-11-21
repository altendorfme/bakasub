import { z } from 'zod'
import type { JobManager } from '../../jobs/job-manager'
import { JobCreateRequestSchema } from '../../jobs/job-spec'
import { createHandler } from '../create-handler'

const byId = z.object({ id: z.string().min(1).max(64) })

export function registerJobHandlers(deps: { jobs: JobManager }): void {
  createHandler('jobs:create', {
    input: JobCreateRequestSchema,
    handle: (request) => deps.jobs.create(request)
  })
  createHandler('jobs:list', { handle: () => deps.jobs.list() })
  createHandler('jobs:get', { input: byId, handle: ({ id }) => deps.jobs.get(id) })
  createHandler('jobs:cancel', { input: byId, handle: ({ id }) => deps.jobs.cancel(id) })
  createHandler('jobs:retry', { input: byId, handle: ({ id }) => deps.jobs.retry(id) })
  createHandler('jobs:confirm', { input: byId, handle: ({ id }) => deps.jobs.confirm(id) })
  createHandler('jobs:dismiss-consistency', {
    input: byId,
    handle: ({ id }) => deps.jobs.dismissConsistency(id)
  })
  createHandler('jobs:preflight', {
    input: byId,
    handle: async ({ id }) => (await deps.jobs.preflight(id)) ?? null
  })
  createHandler('jobs:remove', {
    input: byId,
    handle: async ({ id }) => {
      await deps.jobs.remove(id)
      return { removed: true as const }
    }
  })
  createHandler('jobs:clear-completed', {
    handle: async () => ({ removed: await deps.jobs.clearFinished() })
  })
}
