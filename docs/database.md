# Database

SQLite through `@libsql/client` + Drizzle ORM. File: `userData/bakasub.db`.

## Initialization (`src/main/database/client.ts`)

```
createClient({ url: file:// })
PRAGMA journal_mode = WAL
PRAGMA synchronous = NORMAL
PRAGMA foreign_keys = ON
PRAGMA busy_timeout = 5000
drizzle(client, { schema }) → migrate(db, { migrationsFolder: paths.migrations() })
```

`paths.migrations()` is `<appPath>/drizzle` in development and `process.resourcesPath/drizzle` when packaged (`extraResources` in `electron-builder.yml`).

On shutdown the `database` disposer runs `PRAGMA wal_checkpoint(TRUNCATE)` and closes the client, leaving an empty `-wal` file.

## Migrations

```bash
npm run db:generate   # drizzle-kit generate → drizzle/
npm run db:check      # consistency check, also run in CI
```

Schema files live in `src/main/database/schema/` and are re-exported from `index.ts`. Migrations are committed.

## Tables

### `profiles`

| Column       | Type                                     | Notes                                             |
| ------------ | ---------------------------------------- | ------------------------------------------------- |
| `id`         | integer PK autoincrement                 |                                                   |
| `name`       | text, unique, not null                   |                                                   |
| `model`      | text, not null                           | OpenRouter model id                               |
| `glossary`   | text (JSON), not null, default `'[]'`    | termbase injected at the top of the System Prompt |
| `created_at` | integer (ms), default `unixepoch()*1000` |                                                   |

### `job_memory`

| Column            | Type                                     | Notes     |
| ----------------- | ---------------------------------------- | --------- |
| `id`              | integer PK autoincrement                 |           |
| `context_hash`    | text, not null                           | see below |
| `target_lang`     | text, not null                           |           |
| `model`           | text, not null                           |           |
| `source_text`     | text, not null                           |           |
| `translated_text` | text, not null                           |           |
| `updated_at`      | integer (ms), default `unixepoch()*1000` |           |

Indexes: unique `(context_hash, target_lang)`; `updated_at`.

Context hash rule (from `AGENTS.md`, **not implemented yet**): sentences with ≤ 3 words hash `normalized_previous_line + current_line`; longer ones hash `current_line` only. Writes are meant to be upserts against the unique index.

**Open design question:** the unique key does not include `model`, so a translation produced by a different model overwrites the cached one. Decide whether `model` belongs in the key before implementing the repository.

## Planned

`repositories/` is reserved for the data-access layer (upsert for `job_memory`, profile CRUD). Job state tables will be added together with the Job Manager.
