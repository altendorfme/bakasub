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

### `presets`

Custom presets only (built-ins live in code, see [`presets.md`](./presets.md)).

| Column        | Type                                     | Notes                                             |
| ------------- | ---------------------------------------- | ------------------------------------------------- |
| `id`          | text PK (UUID)                           | built-in ids (`builtin:*`) never appear here      |
| `name`        | text, unique                             |                                                   |
| `media_type`  | text                                     | free label, 1–40 chars                            |
| `temperature` | real                                     |                                                   |
| `prompt`      | text                                     | style guidance (System Prompt)                    |
| `glossary`    | text (JSON), default `'[]'`              | termbase injected at the top of the System Prompt |
| `copied_from` | text, nullable                           | origin preset id when duplicated                  |
| `created_at`  | integer (ms), default `unixepoch()*1000` |                                                   |

### `settings`

Plain (non-secret) settings: `key` text PK, `value` JSON, `updated_at`. Every key, its Zod schema and its default live in one registry, `SETTINGS_SCHEMA` (`src/main/settings/settings-schema.ts`); `SettingsService` returns the default for a missing or invalid value (logged) and validates on write. Current keys: `models.cache` (normalized `/api/v1/models` catalog, see [`llm.md`](./llm.md)), `jobs.concurrency` (1–4, default 2), `tracks.preferredSourceLangs` (default `['en']`), `preflight.autoConfirmBelowUsd` (USD or `null` = always ask), `translation.defaultModel` (`null`), `translation.defaultTargetLang` (`null`), `translation.defaultPresetId` (`builtin:series`), `translation.targetLangs` (`[]`, the user's target languages), `models.favorites` (`[]`, the only models offered when translating), `logs.level` (`info` or `debug`, see [`logging.md`](./logging.md)), `ui.language` (`en`, `pt-BR` or `null` = follow the system), and the advanced `llm.rateLimit.*` / `llm.retry.*` keys (see [`rate-limits.md`](./rate-limits.md)).

The renderer reads and writes the public subset through `PreferencesService` (`settings:get` / `settings:update`, never `models.cache`). It enforces the links between keys: the default model is always a favorite and the default language is always in `translation.targetLangs` (setting a default adds it; removing the current default without changing it → `SETTINGS_CONFLICT`), languages are canonical BCP-47 without duplicates, and the default preset must exist. Changing `jobs.concurrency` kicks the queue right away; lowering it never interrupts running jobs. `llm.retry.baseDelayMs` must not exceed `llm.retry.maxDelayMs` (`SETTINGS_CONFLICT`). `settings:reset { keys }` restores factory defaults through the same rules. Saving `null` deletes the row (the `value` column is NOT NULL and every nullable key defaults to `null`), so it reads back as the default.

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
| `prompt_hash`     | text, not null, default `''`             | sha256 of the canonical glossary JSON; `''` without glossary           |
| `source_text`     | text, not null                           | source payload with markers (`<gN>`, `<xN/>`, `<br/>`)                 |
| `translated_text` | text, not null                           | translated payload with markers                                        |
| `updated_at`      | integer (ms), default `unixepoch()*1000` | last rewrite of the translation                                        |
| `last_used_at`    | integer (ms), default `unixepoch()*1000` | last hit or write; the prune works on this column                      |

Indexes: unique `(context_hash, target_lang, model, prompt_hash)`; `last_used_at`.

Repository: `src/main/database/repositories/job-memory.repository.ts` (`lookupMany`, `upsertMany` in one transaction, `touch`, `prune` + `incremental_vacuum`, `stats` with real on-disk bytes from `dbstat`). Policy lives in the service; see [`job-memory.md`](./job-memory.md).

### `jobs`

| Column                                                     | Type               | Notes                                                                    |
| ---------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| `id`                                                       | text PK (UUID)     |                                                                          |
| `kind`                                                     | text               | `extract` / `translate` / `mux` / `pipeline`                             |
| `batch_id`                                                 | text, nullable     | reserved for batch mode                                                  |
| `status`                                                   | text               | see [`jobs.md`](./jobs.md)                                               |
| `step`                                                     | text, nullable     | current step, or where it stopped                                        |
| `spec`                                                     | JSON               | validated, frozen request (paths, options, **resolved preset snapshot**) |
| `progress`                                                 | JSON               | last persisted progress (per step / translation chunk)                   |
| `artifacts`                                                | JSON               | per-step outputs with size + sha256 (retry resumes from the failed step) |
| `result`                                                   | JSON, nullable     | outputs, warnings, LLM usage, cache hits, failed lines                   |
| `error`                                                    | JSON, nullable     | `{ code, message }`                                                      |
| `attempt`                                                  | integer, default 1 | incremented by `jobs:retry`                                              |
| `created_at` / `updated_at` / `started_at` / `finished_at` | integer (ms)       |                                                                          |

Indexes: `(status, created_at)` (FIFO queue), `batch_id`. Every transition is a single `UPDATE`.

### `media_cache`

`key` text PK (`tmdb:search:<query>`, `tmdb:movie:<id>`, `tmdb:tv:<id>`, `tmdb:episode:<id>:<s>:<e>`), `value` JSON (normalized response), `fetched_at` (ms). TTL is applied on read (searches 1 day, details 30 days; expired entries are still served offline). See [`media-context.md`](./media-context.md). Secrets: the TMDB credential lives in `secrets` as `tmdb.credential`.

### `batches`

`id` text PK, `name`, `kind` (`extract` / `translate` / `pipeline`), `root` (source folder or `null`), `options` (JSON: preset id, notes, languages, output dir, mux options), `created_at`. Created together with its jobs in one transaction (`BatchRepository.insertWithJobs`); status is aggregated from `jobs.batch_id`.

Repositories: `preset.repository.ts` (custom presets; validation and built-ins in `PresetService`), `job.repository.ts`, `batch.repository.ts`.
