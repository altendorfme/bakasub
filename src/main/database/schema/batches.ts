import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { BatchKind } from '../../../shared/ipc-contract'

/** Agrupa jobs independentes criados juntos (pasta ou vários arquivos). Não executa nada. */
export const batches = sqliteTable('batches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').$type<BatchKind>().notNull(),
  /** Pasta de origem (batch de pasta) ou `null` (arquivos avulsos). */
  root: text('root'),
  /** Opções comuns congeladas (perfil, idiomas, pasta de saída…). */
  options: text('options', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
})
