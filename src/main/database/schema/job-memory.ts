import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Job Memory: cache contínuo de linhas traduzidas (upsert).
 * `contextHash` = hash(normalized_prev + current) se <= 3 palavras; senão hash(current).
 */
export const jobMemory = sqliteTable(
  'job_memory',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contextHash: text('context_hash').notNull(),
    targetLang: text('target_lang').notNull(),
    model: text('model').notNull(),
    sourceText: text('source_text').notNull(),
    translatedText: text('translated_text').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
  },
  (t) => [
    uniqueIndex('job_memory_hash_lang_uq').on(t.contextHash, t.targetLang),
    index('job_memory_updated_idx').on(t.updatedAt)
  ]
)
