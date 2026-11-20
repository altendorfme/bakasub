# Job Memory

Continuous translation cache in SQLite. Reprocessing a file (or another release of the same episode) hits the cache instead of the LLM. Code: `src/main/memory/` (pure hashing + policy) and `src/main/database/repositories/job-memory.repository.ts` (SQL only).

```
doc ──► computeContextHashes ──► HashedUnit[] (cueId, hash, unit = payload + skeleton)
     ──► JobMemoryService.lookupDocument ──► hits (validated) + misses (→ LLM)
LLM chunk validated ──► JobMemoryService.commitChunk ──► one transaction (upsertMany)
settings ──► memory:stats / memory:prune
```

## What is stored

Payloads, not plain text: `source_text` is the source payload and `translated_text` the translated payload, both with the segmentation markers (`<gN>…</gN>`, `<xN/>`, `<br/>`, see [`parsing.md`](./parsing.md)). Reinjection needs the markers. Only marker ids/order are in the payload, never the tags' `raw`, so `{\an8}` vs `{\an2}` (or a different edge tag) share the same entry.

**Every hit is validated** with `validateTranslation` against the current cue's skeleton (and `source_text` must equal the current payload). A corrupt or incompatible entry is a miss: the cue goes to the LLM and the upsert overwrites the entry.

## Key

`(context_hash, target_lang, model, prompt_hash)`:

| Part           | Rule                                                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context_hash` | below                                                                                                                                                                                                                                         |
| `target_lang`  | canonical BCP-47 via `Intl.getCanonicalLocales` (`pt-br` → `pt-BR`; `pt-BR` ≠ `pt-PT`)                                                                                                                                                        |
| `model`        | OpenRouter model id. Another model starts cold (never an automatic hit)                                                                                                                                                                       |
| `prompt_hash`  | sha256 of the canonical JSON of `{ glossary, style }` (preset glossary + style prompt); `''` if both are empty. Changing either invalidates; presets with the same glossary and style share. Temperature and media context are not part of it |

`sourceLang` is **not** part of the key: the source text already determines it.

## Context hash (`context-hash.ts`)

```
hash = sha256_hex("v1" + "\0" + prev + "\0" + normalizeForHash(payload))
```

- `prev` is used only when the current cue has **≤ 3 words**; otherwise `''`.
- Words: `Intl.Segmenter(sourceLang, { granularity: 'word' })`, counting `isWordLike` segments over the normalized plain text (punctuation does not count; CJK is segmented by dictionary). Unknown/invalid `sourceLang` → ICU default locale.
- `prev` = normalized plain text (`cuePlainText`, no markers) of the previous **translatable** cue ordered by `start.ms` (ties: file order). Drawings, karaoke, letterless cues and unparsed blocks never get a hash and never serve as context. The first cue uses `''`.
- `normalizeForHash` (`parsers/core/plain-text.ts`): NFC, ASS `\h` → space, collapse whitespace, trim. Case is preserved ("OK." and "ok." may need different translations).
- `v1` is bumped whenever normalization or composition changes; old entries simply stop matching and age out through the prune.

## Writes and cancellation

- `commitChunk(ctx, entries, signal)` validates each translation again, writes the valid ones with `upsertMany` in **one transaction per LLM chunk** and returns `{ written, rejected }`.
- **One write queue per process**: `commitChunk`, the hit `touch` and `prune` go through `JobMemoryService.write`, a promise chain. libsql transactions take different connections from its pool and SQLite's lock wait is synchronous (it blocks the Main thread), so two concurrent write transactions (parallel lanes, concurrent jobs) gave `SQLITE_BUSY: database is locked` immediately, or would freeze the Main for `busy_timeout` if one were set on the pool. Regression test: `escritas simultâneas … sem SQLITE_BUSY`.
- If the `AbortSignal` is already aborted (or the service is disposed), it throws `AppError('CANCELLED')` and nothing is written. A transaction that already started finishes (it is short); completed chunks stay cached, so a dropped connection or closed app loses at most the chunk in flight.
- Shutdown: the `job-memory` disposer (registered after `database`, LIFO) refuses new writes and awaits in-flight ones before the database closes.
- Hits update `last_used_at` in one batched `UPDATE` per lookup, except with `{ peek: true }` (the preflight): a cancelled preflight must not keep stale entries alive.

## Size and prune

- `stats()`: rows, real on-disk bytes of the table + indexes (`dbstat`), oldest `last_used_at`.
- `prune(1 | 3 | 7 | 30 | 'all')`: deletes entries **not used** for more than N days (by `last_used_at`, so frequently reprocessed episodes keep their cache), then `PRAGMA incremental_vacuum` (the database runs with `auto_vacuum = INCREMENTAL`, see [`database.md`](./database.md)) so the file actually shrinks.
- Refused with `AppError('MEMORY_BUSY')` while a job runs (`isBusy` = the Job Manager has a running job).
- Nothing is pruned automatically.

## IPC

Only `memory:stats` and `memory:prune` are exposed ([`ipc.md`](./ipc.md)). Lookup and writes are internal to the Main process. UI requirements: [`frontend-requirements.md`](./frontend-requirements.md).

## Open points

- `sourceLang` comes from the job (option, filename suffix or MKV track language).
