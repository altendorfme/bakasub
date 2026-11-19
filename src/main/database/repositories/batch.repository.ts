import { count, desc, eq } from 'drizzle-orm'
import type { JobStatus } from '../../../shared/ipc-contract'
import type { Database } from '../init'
import { batches, jobs } from '../schema'
import type { NewJob } from './job.repository'

export type BatchRow = typeof batches.$inferSelect
export type NewBatch = Omit<typeof batches.$inferInsert, 'createdAt'>

export class BatchRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now
  ) {}

  /** Tudo ou nada: o batch e todos os seus jobs. */
  async insertWithJobs(batch: NewBatch, items: readonly NewJob[]): Promise<BatchRow> {
    const at = new Date(this.now())
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(batches)
        .values({ ...batch, createdAt: at })
        .returning()
      // Mesmo instante para todos: a ordem FIFO dentro do batch vem do id sequencial abaixo.
      for (const [i, j] of items.entries())
        await tx.insert(jobs).values({
          progress: { step: null },
          artifacts: {},
          ...j,
          batchId: batch.id,
          createdAt: new Date(at.getTime() + i),
          updatedAt: at
        })
      return row
    })
  }

  async get(id: string): Promise<BatchRow | null> {
    const [row] = await this.db.select().from(batches).where(eq(batches.id, id))
    return row ?? null
  }

  list(limit = 100): Promise<BatchRow[]> {
    return this.db.select().from(batches).orderBy(desc(batches.createdAt)).limit(limit)
  }

  async counts(id: string): Promise<Partial<Record<JobStatus, number>>> {
    const rows = await this.db
      .select({ status: jobs.status, n: count() })
      .from(jobs)
      .where(eq(jobs.batchId, id))
      .groupBy(jobs.status)
    return Object.fromEntries(rows.map((r) => [r.status, r.n]))
  }

  async jobIds(id: string): Promise<string[]> {
    const rows = await this.db.select({ id: jobs.id }).from(jobs).where(eq(jobs.batchId, id))
    return rows.map((r) => r.id)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(batches).where(eq(batches.id, id))
  }
}
