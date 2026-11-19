import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  model: text('model').notNull(),
  /** Termbase: regras estritas injetadas no topo do System Prompt. JSON: Array<{source,target?,rule}> */
  glossary: text('glossary', { mode: 'json' })
    .$type<unknown[]>()
    .notNull()
    .default(sql`'[]'`),
  /** Idioma de destino padrão (BCP-47) pré-preenchido na UI; o job pode sobrescrever. */
  targetLang: text('target_lang').notNull().default('pt-BR'),
  temperature: real('temperature').notNull().default(0.3),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
})
