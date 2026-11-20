import { asc, desc, eq, inArray } from 'drizzle-orm'
import type { Database } from '../init'
import { jobs } from '../schema'

export type JobRow = typeof jobs.$inferSelect
export type NewJob = Pick<typeof jobs.$inferInsert, 'id' | 'kind' | 'spec' | 'status'> &
  Partial<Pick<typeof jobs.$inferInsert, 'batchId'>>
export type JobPatch = Partial<
  Pick<
    typeof jobs.$inferInsert,
    | 'status'
    | 'step'
    | 'progress'
    | 'artifacts'
    | 'result'
    | 'error'
    | 'attempt'
    | 'startedAt'
    | 'finishedAt'
  >
>

/** Persistência dos jobs. Cada `update` é um único statement (atômico). */
export class JobRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now
  ) {}

  async insert(job: NewJob): Promise<JobRow> {
    const at = new Date(this.now())
    const [row] = await this.db
      .insert(jobs)
      .values({ progress: { step: null }, artifacts: {}, ...job, createdAt: at, updatedAt: at })
      .returning()
    return row
  }

  async get(id: string): Promise<JobRow | null> {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id))
    return row ?? null
  }

  list(limit = 200): Promise<JobRow[]> {
    return this.db.select().from(jobs).orderBy(desc(jobs.createdAt), desc(jobs.id)).limit(limit)
  }

  /** Fila em FIFO. */
  queued(): Promise<JobRow[]> {
    return this.db
      .select()
      .from(jobs)
      .where(eq(jobs.status, 'queued'))
      .orderBy(asc(jobs.createdAt), asc(jobs.id))
  }

  async update(id: string, patch: JobPatch): Promise<void> {
    await this.db
      .update(jobs)
      .set({ ...patch, updatedAt: new Date(this.now()) })
      .where(eq(jobs.id, id))
  }

  /** Não terminais (fila, rodando, aguardando). */
  active(): Promise<JobRow[]> {
    return this.db
      .select()
      .from(jobs)
      .where(inArray(jobs.status, ['queued', 'running', 'awaiting-confirmation']))
  }

  /** Boot: o que estava rodando quando o app morreu. */
  async markInterrupted(): Promise<number> {
    const res = await this.db
      .update(jobs)
      .set({ status: 'interrupted', updatedAt: new Date(this.now()) })
      // `awaiting-confirmation` não estava rodando: continua aguardando após o reinício.
      .where(eq(jobs.status, 'running'))
    return res.rowsAffected
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(jobs).where(eq(jobs.id, id))
  }

  /** Ids dos jobs nos status dados (sem limite: a limpeza da fila não pode deixar sobras). */
  async idsByStatus(statuses: readonly JobRow['status'][]): Promise<string[]> {
    const rows = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(inArray(jobs.status, [...statuses]))
    return rows.map((r) => r.id)
  }

  /** Um único DELETE (atômico). */
  async deleteMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    await this.db.delete(jobs).where(inArray(jobs.id, [...ids]))
  }
}
