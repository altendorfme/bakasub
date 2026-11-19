import { sql } from 'drizzle-orm'
import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Configurações comuns (não sensíveis). `value` é JSON validado pelo registro
 * `SETTINGS_SCHEMA` (`src/main/settings/settings-schema.ts`).
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
})

/**
 * Segredos cifrados (AES-256-GCM, envelope). Separado de `settings` para que nenhum
 * `SELECT` de configurações vaze material sensível para log ou IPC.
 */
export const secrets = sqliteTable('secrets', {
  key: text('key').primaryKey(),
  ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(),
  iv: blob('iv', { mode: 'buffer' }).notNull(),
  tag: blob('tag', { mode: 'buffer' }).notNull(),
  /** Versão da chave mestra usada; permite rotação futura. */
  keyVersion: integer('key_version').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
})

/** Chaves mestras do cofre, embrulhadas pelo `safeStorage` (`os`) ou cruas (`none`). */
export const vaultKeys = sqliteTable('vault_keys', {
  version: integer('version').primaryKey(),
  wrapped: blob('wrapped', { mode: 'buffer' }).notNull(),
  protection: text('protection', { enum: ['os', 'none'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
})
