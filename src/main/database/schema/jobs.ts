import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type {
  JobKind,
  JobProgress,
  JobResult,
  JobStatus,
  JobStep
} from '../../../shared/ipc-contract'

/**
 * Jobs persistidos. `spec` é o pedido já validado e congelado (inclui a cópia do perfil);
 * `artifacts` guarda as saídas de cada etapa (com tamanho e sha256) para retomar no retry.
 * Ver `docs/jobs.md`.
 */
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<JobKind>().notNull(),
    /** Reservado para o modo batch. */
    batchId: text('batch_id'),
    status: text('status').$type<JobStatus>().notNull(),
    step: text('step').$type<JobStep>(),
    spec: text('spec', { mode: 'json' }).$type<unknown>().notNull(),
    progress: text('progress', { mode: 'json' }).$type<JobProgress>().notNull(),
    artifacts: text('artifacts', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    result: text('result', { mode: 'json' }).$type<JobResult>(),
    error: text('error', { mode: 'json' }).$type<{ code: string; message: string }>(),
    attempt: integer('attempt').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' })
  },
  (t) => [index('jobs_status_idx').on(t.status, t.createdAt), index('jobs_batch_idx').on(t.batchId)]
)
