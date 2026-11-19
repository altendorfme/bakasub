# Database

SQLite through `@libsql/client` + Drizzle ORM. File: `userData/bakasub.db`.

## Initialization (`src/main/database/init.ts`, wrapped by `client.ts`)

`initDatabase(client, migrationsFolder)` has no Electron dependency, so tests run it against a temporary file (not `:memory:`: `client.transaction()` opens a second connection, which would see an empty in-memory database).

```
createClient({ url: file:// })
PRAGMA auto_vacuum            → if not INCREMENTAL: PRAGMA auto_vacuum = INCREMENTAL; VACUUM (once)
PRAGMA journal_mode = WAL
PRAGMA synchronous = NORMAL
PRAGMA foreign_keys = ON
PRAGMA busy_timeout = 5000
drizzle(client, { schema }) → migrate(db, { migrationsFolder: paths.migrations() })
```

`auto_vacuum = INCREMENTAL` lets the Job Memory prune give pages back to the OS with `PRAGMA incremental_vacuum` instead of a full `VACUUM`. Caveat: `@libsql/client`'s `execute()` steps a statement only once and `incremental_vacuum` frees **one page per step**, so it must run through `client.executeMultiple()` (`sqlite3_exec`, runs to completion). The `Database` type exposes `$client` for that.

`paths.migrations()` is `<appPath>/drizzle` in development and `process.resourcesPath/drizzle` when packaged (`extraResources` in `electron-builder.yml`).

On shutdown the `database` disposer runs `PRAGMA wal_checkpoint(TRUNCATE)` and closes the client, leaving an empty `-wal` file. The `job-memory` disposer is registered after it, so (LIFO) in-flight cache writes finish before the database closes.

## Migrations

```bash
npm run db:generate   # drizzle-kit generate → drizzle/
npm run db:check      # consistency check, also run in CI
```

Schema files live in `src/main/database/schema/` and are re-exported from `index.ts`. Migrations are committed.

**Until the first public release, `0000` is mutable:** schema changes delete `drizzle/` and regenerate it, and every dev machine deletes `userData/bakasub.db*` once (Drizzle's migrator only compares the journal timestamp with the last applied one and never checks the SQL hash, so an edited `0000` is either skipped silently or re-applied and fails with `table already exists`). After the first release, only incremental migrations.

## Tables

### `profiles`

| Column        | Type                                     | Notes                                             |
| ------------- | ---------------------------------------- | ------------------------------------------------- |
| `id`          | integer PK autoincrement                 |                                                   |
| `name`        | text, unique, not null                   |                                                   |
| `model`       | text, not null                           | OpenRouter model id                               |
| `glossary`    | text (JSON), not null, default `'[]'`    | termbase injected at the top of the System Prompt |
| `target_lang` | text, not null, default `'pt-BR'`        | default target language pre-filled by the UI      |
| `temperature` | real, not null, default `0.3`            | sampling temperature for translation requests     |
| `created_at`  | integer (ms), default `unixepoch()*1000` |                                                   |

### `settings`

Plain (non-secret) settings: `key` text PK, `value` JSON, `updated_at`. Every key, its Zod schema and its default live in one registry, `SETTINGS_SCHEMA` (`src/main/settings/settings-schema.ts`); `SettingsService` returns the default for a missing or invalid value (logged) and validates on write. Current keys: `models.cache` (normalized `/api/v1/models` catalog, see [`llm.md`](./llm.md)), `jobs.concurrency` (1–4, default 2), `tracks.preferredSourceLangs` (default `['en']`), `preflight.autoConfirmBelowUsd` (USD or `null` = always ask).

### `secrets` and `vault_keys`

Envelope encryption (`src/main/settings/secret-vault.ts`):

- `vault_keys(version PK, wrapped, protection, created_at)`: a random 32-byte master key, wrapped by Electron `safeStorage` (`protection = 'os'`: DPAPI, Keychain, libsecret/KWallet) or stored raw (`'none'`: no OS keyring, or Linux `basic_text` backend). A raw key is promoted to `os` automatically when the keyring becomes available. If the wrapped key can no longer be unwrapped (keyring changed), the vault is reset and the secrets are discarded (`recovered: true`, logged); the user re-enters them.
- `secrets(key PK, ciphertext, iv, tag, key_version, updated_at)`: AES-256-GCM per secret, random 12-byte IV, the secret name as AAD (a ciphertext copied to another row does not decrypt). A tampered row reads as `null`, never throws.
- Kept apart from `settings` so no settings query can leak key material to logs or IPC. Secrets never travel to the renderer (`settings:set-api-key` is write-only).

### `job_memory`

| Column            | Type                                     | Notes                                                                  |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| `id`              | integer PK autoincrement                 |                                                                        |
| `context_hash`    | text, not null                           | sha256 of `v1\0prev\0payload` (see [`job-memory.md`](./job-memory.md)) |
| `target_lang`     | text, not null                           | canonical BCP-47 (`pt-BR` ≠ `pt-PT`)                                   |
| `model`           | text, not null                           | OpenRouter model id                                                    |
| `glossary_hash`   | text, not null, default `''`             | sha256 of the canonical glossary JSON; `''` without glossary           |
| `source_text`     | text, not null                           | source payload with markers (`<gN>`, `<xN/>`, `<br/>`)                 |
| `translated_text` | text, not null                           | translated payload with markers                                        |
| `updated_at`      | integer (ms), default `unixepoch()*1000` | last rewrite of the translation                                        |
| `last_used_at`    | integer (ms), default `unixepoch()*1000` | last hit or write; the prune works on this column                      |

Indexes: unique `(context_hash, target_lang, model, glossary_hash)`; `last_used_at`.

Repository: `src/main/database/repositories/job-memory.repository.ts` (`lookupMany`, `upsertMany` in one transaction, `touch`, `prune` + `incremental_vacuum`, `stats` with real on-disk bytes from `dbstat`). Policy lives in the service; see [`job-memory.md`](./job-memory.md).

### `jobs`

| Column                                                     | Type               | Notes                                                                    |
| ---------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| `id`                                                       | text PK (UUID)     |                                                                          |
| `kind`                                                     | text               | `extract` / `translate` / `mux` / `pipeline`                             |
| `batch_id`                                                 | text, nullable     | reserved for batch mode                                                  |
| `status`                                                   | text               | see [`jobs.md`](./jobs.md)                                               |
| `step`                                                     | text, nullable     | current step, or where it stopped                                        |
| `spec`                                                     | JSON               | validated, frozen request (paths, options, **profile snapshot**)         |
| `progress`                                                 | JSON               | last persisted progress (per step / translation chunk)                   |
| `artifacts`                                                | JSON               | per-step outputs with size + sha256 (retry resumes from the failed step) |
| `result`                                                   | JSON, nullable     | outputs, warnings, LLM usage, cache hits, failed lines                   |
| `error`                                                    | JSON, nullable     | `{ code, message }`                                                      |
| `attempt`                                                  | integer, default 1 | incremented by `jobs:retry`                                              |
| `created_at` / `updated_at` / `started_at` / `finished_at` | integer (ms)       |                                                                          |

Indexes: `(status, created_at)` (FIFO queue), `batch_id`. Every transition is a single `UPDATE`.

### `batches`

`id` text PK, `name`, `kind` (`extract` / `translate` / `pipeline`), `root` (source folder or `null`), `options` (JSON: profile id, languages, output dir, mux options), `created_at`. Created together with its jobs in one transaction (`BatchRepository.insertWithJobs`); status is aggregated from `jobs.batch_id`.

Repositories: `profile.repository.ts` (profile CRUD; validation in `ProfileService`), `job.repository.ts`.
