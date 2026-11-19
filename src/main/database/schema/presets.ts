import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { GlossaryEntry, MediaType } from '../../../shared/ipc-contract'

/**
 * Presets PERSONALIZADOS. Os embutidos vivem no código (`src/main/presets/builtin-presets.ts`)
 * e nunca são gravados aqui.
 */
export const presets = sqliteTable('presets', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  mediaType: text('media_type').$type<MediaType>().notNull(),
  temperature: real('temperature').notNull(),
  /** Orientação de estilo (System Prompt). */
  prompt: text('prompt').notNull(),
  glossary: text('glossary', { mode: 'json' })
    .$type<GlossaryEntry[]>()
    .notNull()
    .default(sql`'[]'`),
  /** `null` = modelo padrão das configurações. */
  model: text('model'),
  /** `null` = idioma padrão das configurações. */
  targetLang: text('target_lang'),
  /** Id do preset de origem quando copiado. */
  copiedFrom: text('copied_from'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
})
