import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  model: text('model').notNull(),
  /** Termbase: regras estritas injetadas no topo do System Prompt. JSON: Array<{source,target?,rule}> */
  glossary: text('glossary', { mode: 'json' })
    .$type<unknown[]>()
    .notNull()
    .default(sql`'[]'`),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
})
