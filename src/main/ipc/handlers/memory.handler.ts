import { z } from 'zod'
import type { MemoryStats } from '../../../shared/ipc-contract'
import type { JobMemoryService } from '../../memory/job-memory.service'
import { createHandler } from '../create-handler'

const pruneInput = z.object({
  olderThanDays: z.union([
    z.literal(1),
    z.literal(3),
    z.literal(7),
    z.literal(30),
    z.literal('all')
  ])
})

export function registerMemoryHandlers(deps: { memory: JobMemoryService }): void {
  const stats = async (): Promise<MemoryStats> => {
    const s = await deps.memory.stats()
    return { rows: s.rows, bytes: s.bytes, oldestUsedAt: s.oldestUsedAt?.toISOString() ?? null }
  }
  createHandler('memory:stats', { handle: stats })
  createHandler('memory:prune', {
    input: pruneInput,
    handle: async ({ olderThanDays }) => {
      const { deleted } = await deps.memory.prune(olderThanDays)
      return { deleted, stats: await stats() }
    }
  })
}
