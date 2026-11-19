import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Respostas do provedor de contexto de mídia (TMDB), já normalizadas. A chave descreve a
 * requisição (`tmdb:search:<q>`, `tmdb:movie:<id>`, `tmdb:tv:<id>`, `tmdb:episode:<id>:<s>:<e>`).
 * O TTL é aplicado na leitura; sem rede, uma entrada vencida ainda é usada.
 */
export const mediaCache = sqliteTable('media_cache', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull()
})
