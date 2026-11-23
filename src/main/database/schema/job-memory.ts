import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Job Memory: cache contínuo de linhas traduzidas (upsert). Ver `docs/job-memory.md`.
 * `sourceText`/`translatedText` são payloads com marcadores (`<gN>`, `<xN/>`, `<br/>`).
 */
export const jobMemory = sqliteTable(
  'job_memory',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** sha256 de `v1\0prev\0payload` (ver `src/main/memory/context-hash.ts`). */
    contextHash: text('context_hash').notNull(),
    /** BCP-47 canônico (`pt-BR` ≠ `pt-PT`). */
    targetLang: text('target_lang').notNull(),
    model: text('model').notNull(),
    /** sha256 de versão das regras do prompt + glossário + estilo (ver `promptHash`); nunca '' em linhas novas. */
    promptHash: text('prompt_hash').notNull().default(''),
    /**
     * Obra (não episódio) do contexto de mídia congelado no job: `tmdb:<kind>:<id>` (ver
     * `mediaScope`). `''` sem obra identificada (e em linhas anteriores à coluna): só casa com `''`.
     */
    mediaScope: text('media_scope').notNull().default(''),
    sourceText: text('source_text').notNull(),
    translatedText: text('translated_text').notNull(),
    /** Última reescrita da tradução. */
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    /** Último hit ou escrita; base do prune. */
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
  },
  (t) => [
    uniqueIndex('job_memory_key_uq').on(
      t.contextHash,
      t.targetLang,
      t.model,
      t.promptHash,
      t.mediaScope
    ),
    index('job_memory_last_used_idx').on(t.lastUsedAt)
  ]
)
