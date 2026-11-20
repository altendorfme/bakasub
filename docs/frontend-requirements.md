# Frontend requirements backlog

Requirements that the backend/API work has already committed to exposing, but that have **no UI yet**. Review this file before starting any renderer work and tick items off as they ship. Add new entries whenever an API decision implies something the user must be able to see or do.

## 1. Translation coverage in the preflight (from the SRT parser design)

Some subtitle content will not be sent to the LLM. The user must be told **what, where and why**, before the Job starts; silent omissions are not acceptable.

Source: `analyzeCoverage(doc): CoverageReport` (`src/main/parsers/core/coverage.ts`, implemented; see [`parsing.md`](./parsing.md)), computed by the same `classify()` the segmenter uses, so the report cannot diverge from the pipeline. It travels to the renderer through `jobs:preflight(id)` (estimate + coverage) while the job is in `awaiting-confirmation` (see [`preflight.md`](./preflight.md)), capped with `maxEntries` (`truncated: true` when cut).

What the UI must show:

| Need        | Field                      | Notes                                                                                 |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Summary     | `totals`, `byReason`       | e.g. "12 lines will not be translated"                                                |
| Where       | `location.line`, `startMs` | line in the file; timestamp when the block has timing                                 |
| What        | `excerpt`                  | ≤ 120 chars, control characters made visible; full raw loaded on demand through `ref` |
| Why         | `reason` + `params`        | **The UI localizes (PT-BR/EN).** The Main process sends codes only                    |
| Consequence | `outcome`                  | `kept-original` (block stays as is in the output) or `omitted`                        |
| Severity    | `severity`                 | `info` is benign, `warn` means real content is left untranslated                      |
| What to do  | `actions`                  | hints: `edit-raw`, `ignore`; the UI decides the interaction                           |

Reason codes the UI needs messages for:

| Code                             | Severity | Meaning for the user                                                                            |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `SKIPPED_NO_LETTERS`             | info     | Cue contains no letters (e.g. `♪♪`, `...`, only tags). Not an alert: count it, make it listable |
| `UNTRANSLATED_ORPHAN_TEXT`       | warn     | Text after a blank line with no timing; it stays in the original language                       |
| `UNTRANSLATED_BAD_TIMING`        | warn     | A `-->` line could not be read                                                                  |
| `SKIPPED_EMPTY_BLOCK`            | info     | Empty block (lone SRT index)                                                                    |
| `SKIPPED_DRAWING`                | info     | ASS/SSA vector drawing (`\p1`…): nothing to translate; kept as is                               |
| `UNTRANSLATED_KARAOKE`           | warn     | ASS/SSA karaoke line (`\k`, `\kf`, `\ko`, `\K`): syllable timing would break; kept as is        |
| `UNTRANSLATED_BAD_EVENT`         | warn     | ASS/SSA `Dialogue:` line that could not be read (missing columns or unreadable time)            |
| `UNTRANSLATED_MARKER_COLLISION`  | warn     | Text resembles an internal marker (`<g1>`); the cue is passed through untouched                 |
| `UNTRANSLATED_VALIDATION_FAILED` | warn     | The model kept breaking the formatting markers after 3 attempts; the line stays in the original |
| `UNTRANSLATED_CONTENT_FILTERED`  | warn     | The provider's moderation blocked the line; it stays in the original                            |

UX rules already decided:

- Only `untranslated` entries count as "lines you need to look at"; `skipped` is informational.
- Unparsed blocks go to the output verbatim by default; export can drop them (`repair: { unparsed: 'drop' }`), which must be an explicit, visible user choice with the resulting diagnostic shown.

### Cost estimate and confirmation

- Jobs in `awaiting-confirmation` need a confirmation screen: lines total / cached / to translate, chunks, input and output token ranges, **cost range** ("≈ US$ 0.12–0.18"), model and price used with the catalog date, and the coverage report above. `approximate: true` must be explicit ("estimate; this model uses a different tokenizer"); `cost: null` means dynamic pricing (show tokens only).
- Actions: confirm (`jobs:confirm`) or cancel (`jobs:cancel`). Batches: total of the waiting jobs (`Batch.preflight`) and "confirm all" (`batches:confirm`).
- Settings: `preflight.autoConfirmBelowUsd` ("continue without asking when the maximum estimated cost is below US$ X") and the per-job `confirmBeforeTranslate` toggle.
- Waiting jobs survive restarts; list them prominently.

## 2. Parser diagnostics and auto-fixes

- Show syntax diagnostics (`Diagnostic { code, severity, fix: 'auto' | 'report', line, col }`) separately from coverage: diagnostics describe the file, coverage describes what will be translated.
- Exports for muxing use the repaired serializer by default; list the applied `fixed` diagnostics so the user knows what changed (renumbered indexes, `.` → `,`, etc.).
- `report`-only issues (`end < start`, overlap, empty cue, `X1:` coordinates, `SRT_AMBIGUOUS_INDEX`, `ASS_TIME_FORMAT`, `ASS_FORMAT_MISSING`) need a visible warning; they are never fixed automatically. The only ASS/SSA auto-fix is `ASS_EOL_MIXED`. WebVTT adds `VTT_*` codes (auto: missing header, timestamp format, missing blank line, `-->` in text, mixed EOL; report: `end < start`, empty cue, unparseable block).
- `Cue.style` and `Cue.actor` (ASS/SSA) are available for grouping/filtering in the UI. There is no style filter in the parser API yet (planned for a later jobs/presets iteration, e.g. to skip sign/OP/ED styles).

## 3. Translation cache (Job Memory) in the settings

Source: `memory:stats` / `memory:prune` (see [`job-memory.md`](./job-memory.md)).

- Always show the cache size on disk (`bytes`, real value from SQLite `dbstat`), the entry count and the oldest `last used` date.
- Prune options: "not used for more than 1 / 3 / 7 / 30 days" and "clear everything". Show the size before and after (`MemoryPruneResult.stats`); the file really shrinks (incremental vacuum).
- Pruning is refused with `MEMORY_BUSY` while a job is running: disable the action (and explain why) instead of only surfacing the error.

## 4. Model selection, API key and translation (from the LLM layer design)

The goal is that the edge cases handled defensively by the backend never happen through the UI.

- **Model picker** built from the `/api/v1/models` catalog (`ModelCatalog`, cached 24 h with offline fallback; IPC `models:list`). For each model show: name/id, price per 1M tokens (prompt/completion; `pricing: null` means dynamic price), context length, **moderation** (`isModerated`: the main provider applies content moderation; lines may come back blocked as `UNTRANSLATED_CONTENT_FILTERED`), and structured-output support (`structuredOutputs` gives the most reliable JSON; models without it work but retry more). Selecting from the catalog prevents `LLM_UNKNOWN_MODEL`; a custom preset (or the default model setting) whose model left the catalog must be flagged.
- **API key**: input field that only writes (`settings:set-api-key`), status from `settings:api-key-status`. When `protection === 'none'`, warn that the OS has no keyring and the key is stored without OS protection. Map `LLM_AUTH` (invalid key) and `LLM_CREDITS` (no credits / key limit) to actionable messages.
- **Cancel**: cancelling a running job is immediate, but some providers keep generating and billing the request in flight (Google, Groq, Mistral, Bedrock…). The cancel confirmation should say so; the final cost includes interrupted generations, and `costIncomplete: true` means it could not be fully determined.
- **Result**: `completed-with-warnings` lists the lines left untranslated (coverage report with `failures`). `LLM_TOO_MANY_FAILURES` (more than 10% of the lines failed validation) should suggest another model; the lines already translated stay in the cache.
- **Progress**: `onProgress` reports `done/total`, cached lines, chunk `index/count` and the cost so far, once per chunk.

## 5. Jobs (from the Job Manager design)

API: `jobs:*`, `presets:*`, `media:probe`, `dialog:*`, event `jobs:progress` (see [`jobs.md`](./jobs.md)).

- **Four actions, usable separately**: extract tracks, translate a subtitle file, mux subtitles into an MKV, and the full pipeline (MKV → translated MKV).
- **Inputs** only via `dialog:open-files` or drag & drop (`window.api.files.pathFor(file)`); output folder via `dialog:choose-output-dir` (default: next to the source). Show `INVALID_PATH` reasons in plain language.
- **Track picker** from `media:probe`: language, name, default/forced flags, event count; image-based (PGS/VobSub/DVB) and `no-parser` tracks visible but disabled with the reason ("image subtitles are not supported", "format not supported"); WebVTT tracks are selectable; fonts count (attachments) as information for ASS.
- **Mux form**: one row per subtitle with language (pre-filled from the filename suffix, e.g. `ep01.pt-BR.ass`), track name (default: language name) and default flag; options `setDefault` and `keepOriginalSubtitles`.
- **Presets screen**: the four built-ins (Movie, Series, Anime, Documentary) read-only with a "duplicate" action; custom presets created from scratch or copied, with name, media type, temperature, style prompt (≤ 4,000 chars), glossary editor (`source`, `target?`, `rule?`), optional model (model picker) and optional target language. `PRESET_READ_ONLY`, `PRESET_NAME_TAKEN`, `PRESET_IN_USE` (deleting a preset used by a queued/running job). See [`presets.md`](./presets.md).
- **Export / import** presets (`presets:export` with a multi-selection, `presets:import` with the rename/skip choice): show the imported presets and every `skipped` entry with its reason; `INVALID_PRESET_FILE` for files that are not BakaSub preset files.
- **Defaults** (settings): default model (`translation.defaultModel`), default target language, default preset. `MODEL_NOT_SET` on job creation means no model anywhere: send the user to pick one.
- **Notes field** on translate/pipeline jobs and batches (synopsis, characters, tone; ≤ 4,000 chars), merged later with the external media context.
- **Job list**: status, step, step progress (`stepFraction`), translation `done/total` with cached lines and chunk `index/count`, cost so far; actions cancel / retry (failed, cancelled, interrupted; resumes from the failed step) / remove (terminal). `completed-with-warnings` must show `result.warnings` and the untranslated lines; `interrupted` jobs after a restart should invite a retry.
- **Sidecars**: `SIDECAR_MISSING` when mkvtoolnix is not installed → offer the install flow (`sidecars:install`).
- **Notification** when a job finishes (native `Notification`), backlog.

## 6. Batch mode (from the batch design)

API: `dialog:open-folder`, `dialog:open-files` (multiple), drag & drop, `batches:*` (see [`jobs.md`](./jobs.md#batch-mode-srcmainbatch)).

- **Source**: a folder (with an "include subfolders" toggle) or several files; batch kinds extract / translate / full pipeline.
- **Plan review before creating**: one row per file with the chosen track(s) (`selected`) and a picker over `tracks`; `extract` allows several tracks, `pipeline` exactly one. Files with `skipped` (no subtitles, only image or unsupported tracks, probe failed + `error`) are shown and excluded by default; `rejected` paths and `truncated` (more than 2,000 files) must be visible.
- **Common options**: preset, notes, target/source language, output folder (default next to each file; with a folder, the structure is mirrored), mux options.
- **Preferred source languages** (setting `tracks.preferredSourceLangs`) drive the automatic selection; expose it in the settings.
- **Batch view**: counts per status, overall progress, cancel all, remove when finished, drill down into its jobs (`batches:jobs`).
- Creating a batch is all-or-nothing: an `INVALID_INPUT` with `item N: …` points to the file to fix or drop.

## 7. Encoding confidence

- `decodeSubtitle()` returns `meta.encoding` and `meta.confidence`. When confidence is low (legacy single-byte encodings), the UI must say which encoding was assumed and let the user override it.

## 8. Sidecars (already implemented API)

- `sidecars:check`, `sidecars:install` (native consent dialog), `sidecars:progress`, `app:check-update`: the current `App.tsx` is a placeholder. A proper onboarding/settings screen is still missing.

## 9. Backend gaps from the UI design

The approved design (prototype variant D, see [`renderer.md`](./renderer.md)) needs IPC that does not exist yet:

- ~~Settings read/write, favorite models, target languages~~: done (`settings:get`/`settings:update`, `models.favorites`, `translation.targetLangs`, see [`database.md`](./database.md)). The request carries `model?`; presets no longer have a model or target language.
- ~~Logs~~: done (JSON lines, `jobId` via async context, 5 rotated files, `logs.level`, `logs:tail`/`watch`/`entry`/`open-folder`/`export`/`report`; see [`logging.md`](./logging.md)).
- ~~Media context~~: done with **TMDB** (backend: [`media-context.md`](./media-context.md); UI: [`renderer.md`](./renderer.md#media-context-panel)). Still open from this list: media panel (title search popover, read-only details, season/episode fields, movie-vs-`SxxEyy` warning, "Include" checkbox), artwork backdrop through `bakasub-media://` URLs, "Metadata and images from TMDB" in the panel and the full TMDB notice in Settings → About, and the key guides rendered in-app (`useGuide('tmdb-key' | 'openrouter-key')`, see [`renderer.md`](./renderer.md#in-app-guides); external links through `app:open-external`).
- ~~Rate limits and retries~~: backend done (see [`rate-limits.md`](./rate-limits.md)). UI still to build: Settings → Advanced with the `llm.rateLimit.*`/`llm.retry.*` fields and "Restore defaults" (`settings:reset`), the free-model quota from `models:free-quota` (tier, used/remaining today), the preflight `freeQuota` warning (`enough: false` → "needs ~N requests, M left today"), `JobProgress.waiting` in the queue and status bar as a countdown ("Waiting for the rate limit", "Paused after a rate limit", "Retrying"), `LLM_DAILY_LIMIT` with the reset time, and the user guide rendered in-app (`useGuide('openrouter-limits')`).
- **Translate a file**: a subtitle file goes through `translate` (no track step, no mux options); a video goes through `pipeline`.

## 10. Implementation order

Priority = shortest path to a full translation through the UI, then whatever unblocks later screens, then management screens, then polish.

**P0, unblocks everything**

1. ~~**Shared foundation**~~ (done, see [`renderer.md`](./renderer.md#foundation)): UI primitives (Input, Select/Combobox, Dialog/Popover, Checkbox/Switch, Tabs, Tooltip, Progress, toast), Query hooks per domain, React error boundary (`reportError(err, 'boundary')`), `GuideView` (react-markdown; guide links navigate in-app, others go through `app:open-external`), countdown for `waiting.untilMs`, app language setting (`ui.language`).
2. ~~**Onboarding `/welcome`**~~ (done, see [`renderer.md`](./renderer.md#onboarding)): OpenRouter key (guide, `protection: 'none'` warning), favorite + default model, target languages + default, sidecars (skippable), TMDB (optional, guide). Router guard until key, default model and default language exist. Builds the model picker and language picker reused later.

**P1, main path**

3. ~~**"Translate a file" wizard**~~ (done without the media panel, see [`renderer.md`](./renderer.md#translate-a-file)): file → track (video only) → preset & context → output → preflight confirmation (cost, coverage, `freeQuota`). Gap: type `CoverageReport` in the contract (`jobs:preflight` returns `coverage: unknown`).
4. ~~**Queue + status bar**~~ (done, see [`renderer.md`](./renderer.md#queue-and-status-bar)): live progress, `waiting` countdown, confirm / cancel / retry / remove, detail panel with warnings, untranslated lines, usage and actionable errors.
5. ~~**Media context panel** (TMDB)~~ (done, see [`renderer.md`](./renderer.md#media-context-panel)): identification, search, season/episode, warnings, "Include", artwork backdrop, attribution.

**P2, management screens**

6. ~~Settings~~ (done, see [`renderer.md`](./renderer.md#settings)): general, keys, cache, sidecars, advanced limits, About. 7. ~~Models and Languages~~ (done, see [`renderer.md`](./renderer.md#models-and-languages)). 8. ~~Presets~~ (done, see [`renderer.md`](./renderer.md#presets)): glossary, import/export. 9. ~~Extract and Mux on their own~~ (done, see [`renderer.md`](./renderer.md#extract-and-mux)). 10. ~~Logs~~ (done, see [`renderer.md`](./renderer.md#logs)).

**P3, needs a decision or is polish**

11. ~~Batch~~ (done after a prototype, inside Translate as "Several files or a folder": works with per-work context and settings; see [`renderer.md`](./renderer.md#translate-several-files-batch)). 12. Parser diagnostics and encoding confidence (gap: not exposed through IPC). 13. ~~Full pt-BR UI locale, native notifications, accessibility review, bundle splitting~~ (done, see [`renderer.md`](./renderer.md#polish)); language picker also on the first onboarding screen.
