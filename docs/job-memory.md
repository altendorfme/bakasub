# Job Memory

Continuous translation cache in SQLite. Reprocessing a file (or another release of the same episode, or another episode of the same work) hits the cache instead of the LLM. Code: `src/main/memory/` (pure hashing + policy) and `src/main/database/repositories/job-memory.repository.ts` (SQL only).

```
doc ──► computeContextHashes ──► HashedUnit[] (cueId, hash, unit = payload + skeleton)
     ──► JobMemoryService.lookupDocument ──► hits (validated) + misses (→ LLM) + copies
LLM chunk validated ──► JobMemoryService.commitChunk ──► one transaction (upsertMany)
settings ──► memory:stats / memory:prune
```

## What is stored

Payloads, not plain text: `source_text` is the source payload and `translated_text` the translated payload, both with the segmentation markers (`<gN>…</gN>`, `<xN/>`, `<br/>`, see [`parsing.md`](./parsing.md)). Reinjection needs the markers. Only marker ids/order are in the payload, never the tags' `raw`, so `{\an8}` vs `{\an2}` (or a different edge tag) share the same entry.

**Copies.** Misses that share a `context_hash` would hit the same cache row, so `lookupDocument` keeps only the first one (document order) in `misses` and groups the rest under `copies` (keyed by the representative's `cueId`). Only representatives go to the LLM; the accepted translation is validated against each copy's own skeleton and reapplied there, and only the representative is written (same row). Typical case: motion-tracked signs typeset frame by frame (a single "Episode 1" title card can be 100+ events with different `\pos`/`\fscx` and identical payload; they share one `Name` too, so the speaker in the hash keeps them grouped, regression test in `context-hash.test.ts`). Copies also require the same speaker: one sentence said by two characters is two representatives. Short lines (≤ 3 words) only group when the previous line also matches, so contextual short lines ("What?" in different scenes) stay separate.

**Every hit is validated** with `validateTranslation` against the current cue's skeleton (and `source_text` must equal the current payload). A corrupt or incompatible entry is a miss: the cue goes to the LLM and the upsert overwrites the entry.

## Key

`(context_hash, target_lang, model, prompt_hash, media_scope)`:

| Part           | Rule                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context_hash` | below                                                                                                                                                                                                                                                                                                                                                                                    |
| `target_lang`  | canonical BCP-47 via `Intl.getCanonicalLocales` (`pt-br` → `pt-BR`; `pt-BR` ≠ `pt-PT`)                                                                                                                                                                                                                                                                                                   |
| `model`        | OpenRouter model id. Another model starts cold (never an automatic hit)                                                                                                                                                                                                                                                                                                                  |
| `prompt_hash`  | sha256 of the canonical JSON of `{ glossary, rules, style }`: preset glossary + style prompt + `PROMPT_RULES_VERSION` (version of the fixed System Prompt text, `prompt-builder.ts`). Never `''`: the version always goes in. Changing any of them invalidates; presets with the same glossary, style and rules version share. Temperature and the media context text are not part of it |
| `media_scope`  | identity of the **work** (not the episode) from the TMDB context frozen in `spec.media`: `mediaScope(details)` = `tmdb:<kind>:<id>` (`tmdb:series:209867`). `''` when the job has no identified work (no TMDB key, no match, "Include these details" off, or the lookup failed when the job was created)                                                                                 |

`sourceLang` is **not** part of the key: the source text already determines it.

**Prompt rules version.** The fixed rules of the System Prompt (`buildSystemPrompt` and the per-language notes in `language-notes.ts`) change the translation, so `PROMPT_RULES_VERSION` (integer, next to the builder) is mixed into `prompt_hash`. Bump it in every PR that changes that fixed text; `prompt-rules-version.test.ts` keeps a `version → fingerprint` history (sha256 of the rendered prompt for every language with notes, one without, and the glossary/style/media wrappers) and fails when the text changes without a new version. Entries written under an older version no longer match the key: they are plain misses (the line is retranslated and stored under the new key) and the old rows leave through `prune`. No data migration. Preflight (`peek`) and the job build the key through the same `JobMemoryService.context`, so the hit estimate stays exact.

**Media scope.** Generic lines ("I'm sure.", "Thank you.") translate differently into gendered languages depending on who speaks, so a translation made for one work must not serve another. The scope is the work, never the season or episode: reprocessing an episode, another release of it, or another episode of the same series all hit. Matching is exact, `''` included: a job **with** a work never reads `''` entries (written by jobs without media, possibly for a different show) and a job **without** a work never reads scoped ones. Rows written before the column (migration `0001_job_memory_media_scope`) got `''`, so they keep serving jobs without media and are misses for jobs with a work. Preflight and job take the scope from the same `translationInput` (`spec.media?.details`), so the hit estimate stays exact. Known gap: without TMDB the cache stays global across works (a fallback on the title parsed from the file name is out of scope).

## Context hash (`context-hash.ts`)

```
no speaker:   hash = sha256_hex("v2" + "\0" + prev + "\0" + normalizeForHash(payload))
with speaker: hash = sha256_hex("v2" + "\x01" + speaker + "\0" + prev + "\0" + normalizeForHash(payload))
```

- `prev` is used only when the current cue has **≤ 3 words**; otherwise `''`.
- Words: `Intl.Segmenter(sourceLang, { granularity: 'word' })`, counting `isWordLike` segments over the normalized plain text (punctuation does not count; CJK is segmented by dictionary). Unknown/invalid `sourceLang` → ICU default locale.
- `prev` = normalized plain text (`cuePlainText`, no markers) of the previous **translatable** cue ordered by `start.ms` (ties: file order). Drawings, karaoke, letterless cues and unparsed blocks never get a hash and never serve as context. The first cue uses `''`.
- `normalizeForHash` (`parsers/core/plain-text.ts`): NFC, ASS `\h` → space, collapse whitespace, trim. Case is preserved ("OK." and "ok." may need different translations).
- `speaker` = `speakerOf(cue.actor)` (`parsers/core/speaker.ts`, the same value sent to the prompt as `speaker="…"`): the ASS/SSA `Name` column or the VTT `<v Name>`, normalized (NFC, control characters → space, whitespace collapsed, trim, **case preserved**). It applies to short and long lines alike. Values that do not identify a character are treated as "no speaker" and keep the speakerless formula: empty, letterless (`-`, `1`, `??`) and the generic list `GENERIC_ACTORS` (`Default`, `NTP`, `Main`, `Comment`, `Sign`, `Song`, `TL Note`…, compared case-insensitively; covered by `speaker.test.ts`). SRT has no speaker, so its hashes only changed by the version. Since the speaker has no control characters, the `\x01` after the version and the first `\0` delimit it unambiguously, and a speakerless key can never equal a speaker key.
- Why: a long line is otherwise keyed by its text alone, so "I'm so tired of this" said by two characters in the same file became a copy and reused the first speaker's gendered translation. Now the same sentence with different speakers is two cache rows and two units sent to the LLM; with the same speaker it still groups as copies.
- **Trade-off:** two releases of the same episode whose `Name` columns differ (different fansub groups, or one that leaves it empty) no longer share cache on the lines that carry a speaker. The speakerless lines still share.
- Changing `GENERIC_ACTORS` changes hashes of the affected lines: bump the version with it.
- The version (`v2` since the speaker entered the hash; `v1` before) is bumped whenever normalization or composition changes; old entries simply stop matching and age out through the prune.

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

Only `memory:stats` and `memory:prune` are exposed ([`ipc.md`](./ipc.md)). Lookup and writes are internal to the Main process.

## Open points

- `sourceLang` comes from the job (option, filename suffix or MKV track language).
