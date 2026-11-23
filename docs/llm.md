# LLM translation layer

`src/main/llm/` turns a parsed subtitle document into a translated one through OpenRouter. It is pure Node (no `electron` import) and fully injectable: `translateDocument(input, deps, { signal, onProgress })`. The Job Manager ([`jobs.md`](./jobs.md)) wraps it in the `translate` step.

```
translateDocument
  ├─ models.find(preset.model)              → LLM_UNKNOWN_MODEL if absent
  ├─ memory.lookupDocument(doc)              → validated hits + misses (see job-memory.md)
  ├─ planLanes(misses, perJob)               → K contiguous lanes of chunks, timeline order
  └─ K lanes in parallel (Promise.all); inside a lane, chunk after chunk:
        ChunkTranslator.run
        ├─ PromptBuilder (system + <context>/<target> | repair)
        ├─ LlmSession.request                → in-flight slot, transport retry, structured output, usage
        ├─ parseTranslations (Zod)           → validateTranslation per line
        ├─ accept valid → memory.commitChunk (one transaction, process-wide write queue)
        └─ repair only the invalid lines (≤ 3 attempts per line)
  → applyTranslation on every known cue → { doc, failed, usage, cache, status }
```

| Module                  | Responsibility                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `sse.ts`                | incremental WHATWG SSE decoder (bytes split anywhere, CR/LF/CRLF, comments, BOM)                    |
| `openrouter-client.ts`  | Chat Completions over SSE, error classification (`LlmError.kind`), idle timeout, key redaction      |
| `model-catalog.ts`      | `/api/v1/models` normalized to `ModelInfo`, cached in `settings` (24 h, offline fallback)           |
| `retry-policy.ts`       | transport decision per error kind and attempt (pure, configurable)                                  |
| `rate-limiter.ts`       | process-wide per lane (free/paid): sliding window, cooldown after a 429, in-flight cap with AIMD    |
| `free-quota.ts`         | free-model daily quota from `GET /api/v1/key`, tier override                                        |
| `llm-session.ts`        | one lane ↔ one model: request + retry + output mode + usage, cost lookup of interrupted generations |
| `chunker.ts`            | chunk planning and the context window                                                               |
| `segmenter.ts`          | cuts the misses into lanes for parallel translation (`planLanes`, `countChunks`)                    |
| `prompt-builder.ts`     | glossary parsing, System Prompt, translate/repair messages, strict JSON Schema                      |
| `response-parser.ts`    | tolerant JSON extraction + Zod shape check                                                          |
| `reasoning.ts`          | reasoning control per model (`planReasoning`) and "budget spent on reasoning" detection             |
| `chunk-translator.ts`   | translate → validate → accept → repair loop, `length`/moderation splits, reasoning budget growth    |
| `translate-document.ts` | orchestration of the lanes, failure threshold, drain/cancellation, progress timeline, final doc     |

## Chunks and context

- Only Job Memory **misses** are sent, one per context hash (copies are filled from their representative and stay out of `<context>`, see [`job-memory.md`](./job-memory.md)), in timeline order (`HashedUnit.timeIndex`: `start.ms`, file order on ties). Inside a lane chunks run **sequentially**, so each chunk sees the previous translations; lanes run in parallel (next section).
- A chunk holds up to **40 lines or ~2,000 estimated tokens** of `<target>` (`token-estimate.ts`: ~4 chars/token, ~1 per CJK character; for limits only, the preflight uses a real tokenizer, see [`preflight.md`](./preflight.md)). A line larger than the budget goes alone.
- `<context>`: the 5 translatable cues before the chunk (source **and** translation when known, from the cache or an earlier chunk) and 2 after (source only), as plain text without markers.
- `max_tokens` ≈ 2.5 × the target estimate + JSON overhead, at least 256, plus a reasoning slack (1,024) when the model's reasoning cannot be turned off, times the lane's budget factor (see [Reasoning models](#reasoning-models)), capped by `top_provider.max_completion_tokens`.

## Lanes (parallel translation)

A file is cut into **K contiguous lanes** that run at the same time. Each lane is sequential, so every chunk but the **head of each lane** gets translated `<before>` lines. Cost is unchanged: same lines, same number of requests.

- **K** = `min(llm.concurrency.perJob, floor(chunks / 2))`, at least 1. Two chunks per lane minimum, otherwise a lane would never have translated context. Small files and mostly cached files fall back to one lane. `perJob = 1` reproduces the old sequential plan exactly.
- **Only "free" cuts**: a cut at line `i` is allowed only if `chunks(prev..i) + chunks(i..end) == chunks(prev..end)`. A cut in the middle of a chunk would create an extra partial chunk, and every extra chunk repeats the System Prompt and the context (measured: +8% prompt on 400 lines × 4 lanes before this rule). `countChunks` replays `planChunks`' rule on precomputed token counts (O(n) per check; 5,000 lines × 8 lanes plan in well under 200 ms).
- **Where to cut**: the ideal cut splits the estimated tokens into K equal parts. Within ±25% of a segment around it, the free cut with the highest score wins: `gap` (next line start − previous line end, i.e. pauses, scene changes, OP/ED) + 10 s per cached line right before the cut (up to 5, the size of `<before>`): with cache hits there the head of the lane gets translated context anyway. Ties go to the closest to the ideal. With no free cut in the window, the closest free cut (greedy chunk boundaries always are). Without slack (e.g. exactly 400 lines and 40-line chunks), the free cuts are only chunk boundaries and lanes can be uneven: cost wins over balance.
- **Static lanes**, no work stealing: stealing would add cuts at arbitrary points. When AIMD lowers the in-flight limit below K, lanes simply wait for a slot in `RateLimiter` (FIFO).
- **Shared state**: `known` (translations so far) is one map for all lanes, so `buildContext` uses another lane's translation when it already exists. `failed`, `validationFailed` and the `MAX_FAILED_RATIO` check are shared too (checked after every chunk of any lane).
- **One `LlmSession` per lane** (usage summed at the end), so waits are tracked per lane.
- **Failure drains**: the first fatal error (or `LLM_TOO_MANY_FAILURES`) is recorded and a `drain` signal goes up. `LlmSession` treats it as "no new requests and no more waiting": the next `acquire`, backoff or extra round throws `DrainRequested` and the lane leaves quietly. A stream already in flight is **never** aborted by a drain (it is being paid for): its valid lines are committed. The job then fails with the first error.
- **Cancellation** by the caller still aborts every stream immediately (`signal` reaches `chat`), as before.
- **Progress** (`TranslateProgress`): `chunk { completed, count, inFlight }`, `timeline { total, cached, translated, failed, active, lanes }` as compact `[from, to)` ranges of timeline positions (rendered as the episode map in the job detail), and `waiting` only when **every** running lane waits (the earliest resume time); one lane in backoff while others work is not "waiting".

## Prompt

- **System** (identical for every chunk of a job: it is the prefix provider prompt caching reuses): the termbase on top (`<glossary>`, whole preset glossary, entries `{source, target?, rule?}`, invalid entries dropped and logged), then the preset style guidance (`<style>`, see [`presets.md`](./presets.md)), then fixed rules in English that always apply (translate only `<target>`, keep every `<gN>…</gN>`/`<xN/>`/`<br/>` exactly once and `<xN/>` in order, no new tags or line breaks, no notes; idiomatic writing: idioms adapted to the natural target-language equivalent with the same tone, imperative mood for commands/battle cries, current official spelling; the rule is written with the target language's English name and followed by per-language notes from `language-notes.ts`, looked up by full BCP 47 tag then base language, e.g. pt-BR: 1990 Orthographic Agreement, imperative examples, idiom example; languages without notes get only the generic rule), then the output format, then `<media>` (frozen TMDB details + user notes, see [`media-context.md`](./media-context.md)) as reference. `<media>` lives here, not in each chunk, to make the cacheable prefix longer.
- **User**: `<context>` (`<before>`/`<after>`), `<target>` with `<line id="N">payload</line>`.
- **`session_id`**: every request of one translation carries the same `session_id` (a UUID per `translateDocument` call). OpenRouter's sticky routing then keeps the model on the same provider endpoint, so the automatic prompt cache (OpenAI, DeepSeek, Gemini 2.5+, Grok, Moonshot…) keeps hitting across chunks and lanes. Fallback on provider errors still applies. `cachedTokens` comes back in `usage`.
- **Repair**: same System; for each failing line, `<source>`, what was `<returned>` and the concrete `<problems>` (e.g. `<g1>…</g1> is missing`, `expected exactly 2 <br/>, got 1`).
- Snapshots in `prompt-builder.test.ts` pin the exact text.
- **`PROMPT_RULES_VERSION`** (`prompt-builder.ts`): version of the fixed System Prompt text (rules + `language-notes.ts`). It is part of the Job Memory `prompt_hash`, so lines cached with older rules are retranslated. **Bump it in every PR that changes the fixed text** and add the new fingerprint to `prompt-rules-version.test.ts` (the test fails otherwise; never edit an existing entry). See [`job-memory.md`](./job-memory.md#key).

## Output

`{ "<cueId>": "<translated payload>" }`. The output mode is a ladder (`output-mode.ts`), strictest first:

1. `json_schema_strict`: `response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }` with exactly the chunk ids as required properties and `additionalProperties: false`, plus `provider.require_parameters: true` (support is per endpoint, not per model).
2. `json_schema`: the same `response_format` **without** `provider` in the body. OpenRouter then treats `response_format` as a soft preference: an endpoint without support may ignore it, and Zod still validates.
3. `json_object`: `response_format: { type: 'json_object' }`.
4. `prompt`: no `response_format`, prompt instructions only.

The job starts at the first step the catalog allows (`structured_outputs` → 1, `response_format` → 3, neither → 4). A `404 "No endpoints found…"` (`LlmErrorKind` `unsupported-params`) moves **one step down** right away: no backoff, no attempt spent, no extra round. The step lives in one `OutputModeState` per job, shared by every lane, so once a lane steps down no later chunk (of any lane) tries the stricter mode again; lanes that were already in flight with the old mode and also get the 404 just move to the current step without stepping down twice. Each downgrade is logged (`output mode downgraded model=… a -> b`) and returned in `TranslateResult.notices`, which the translate step turns into a job warning.

A 404 on the last step fails the job with `LLM_NO_ENDPOINT`. The message says that, besides the model, the account's OpenRouter provider restrictions (Settings → Privacy: allowed/ignored providers, ZDR) may exclude every endpoint, and the job error offers a button to `https://openrouter.ai/settings/privacy`. That cause is the one no output mode can fix.

Every request also carries the `reasoning` field chosen from the catalog (next section), or nothing for models without reasoning control.

Always parsed with the same two layers (`response-parser.ts`): tolerant extraction + Zod shape (extra ids ignored and logged; missing or non-string ids are failures), then `validateTranslation` per line (tags stay strict: a changed `<gN>`, `<xN/>` or `<br/>` is never accepted).

Accepted response shapes:

| Shape                                                       | Result                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `{ "<id>": "<text>" }`, optionally in a code fence or prose | parsed (first balanced object)                                                                     |
| truncated object, e.g. `{"95": "A.", "96": "B.", "97": "C`  | the complete `"id": "text"` pairs before the cut are kept (`truncated: true`); the rest is missing |

Not accepted (fails with the problem in the log): empty content (`empty content`), a top-level array such as `[{"id":1,"text":"…"}]` (`top-level JSON array (expected an object)`), no `{` at all (`no JSON object`), a truncated object with no complete pair such as `{"96": "E` (`malformed or truncated JSON with no complete entry`). An object wrapped in another key (`{"translations":{…}}`) passes the shape but every id is missing (the wrapper key is logged as extra). These shapes were measured against the 2026-11-21…23 logs: only empty and truncated answers (Nemotron) occurred, so no other variant is tolerated until one shows up.

## Reasoning models

Reasoning tokens are billed as output and count against `max_tokens` together with the visible text. A model that reasons by default (Nemotron 3 Super, MiMo v2.6, Claude Haiku 5.5: default effort `medium` or enabled) can spend the whole budget thinking and answer `finish_reason: "length"` with empty content. Subtitle translation does not need reasoning, so it is turned off whenever the model allows it.

`parseModel` reads the catalog's `reasoning` object (`{ mandatory, supported_efforts?, default_enabled?, supports_max_tokens? }`) into `ModelInfo.reasoning`, only when `supported_parameters` lists `reasoning` (sending a parameter the endpoint does not list would narrow routing under `require_parameters`). Unknown effort names are dropped. The catalog cache carries a format `version` (`MODELS_CACHE_VERSION = 2`): an older cache, written without `reasoning`, counts as expired on the next `get` but is still served offline.

`planReasoning(model)` (sent by `LlmSession` on every request of the job; never `exclude`, which still bills):

| Catalog                                             | Request                                                                  | Examples                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| no `reasoning` object / parameter not supported     | nothing (body unchanged)                                                 | non-reasoning models                               |
| `mandatory: true`                                   | lowest supported effort (or nothing) + 1,024-token slack on `max_tokens` | `["high","medium","low"]` → `low`                  |
| `supported_efforts` contains `none`                 | `{ effort: "none" }`                                                     | Nemotron 3 Super, Haiku 5.5, Gemini 3.1 Flash Lite |
| can be disabled, no `none` in the list (or no list) | `{ enabled: false }`                                                     | MiMo v2.6 Flash, Gemini 2.5 Flash Lite             |
| `default_enabled: false`                            | nothing (already off)                                                    |                                                    |

The client reads `usage.completion_tokens_details.reasoning_tokens` (`Usage.reasoningTokens`, absent when the provider does not report it) and the `chat ok` log line shows `max=` and `reasoning=` next to the token counts.

## Retries

| Failure                                                   | Policy                                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| line fails validation / missing from the answer           | accept the valid lines (written to the cache), repair only the failing ones; ≤ 3 attempts per line                          |
| unparseable JSON                                          | counts as an attempt for every pending line; retried with the translate prompt                                              |
| truncated JSON (single line, or `stop`)                   | complete pairs are validated like a normal answer; the cut ones count as missing and are repaired                           |
| `finish_reason: length`, budget spent on reasoning        | same chunk again with `max_tokens` ×2, then ×4 (no split, no content attempt spent); still starved → `LLM_REASONING_BUDGET` |
| `finish_reason: length`, long visible answer              | keep the complete, valid lines before the cut; split only the rest in half (no content attempt spent)                       |
| moderation (403 / `content_filter`)                       | split until isolated (≤ 3 levels); blocked lines → `UNTRANSLATED_CONTENT_FILTERED`                                          |
| 429                                                       | the whole lane cools down (`Retry-After`, else `X-RateLimit-Reset`, else backoff; ≤ 60 s); ≤ 5 attempts                     |
| 429 free-model daily quota                                | fail the job: `LLM_DAILY_LIMIT` (reset time in the message)                                                                 |
| 503                                                       | backoff 1 s…30 s with jitter, this request only; ≤ 5 attempts                                                               |
| 408 / 5xx / error inside the stream / 60 s idle / network | backoff; ≤ 3 attempts                                                                                                       |
| 401 / 402 (or 403 budget) / 400                           | fail the job: `LLM_AUTH` / `LLM_CREDITS` / `LLM_BAD_REQUEST`                                                                |
| 404 "No endpoints found…"                                 | never repeated as is: one output-mode step down for the whole job (see Output); last step → `LLM_NO_ENDPOINT`               |
| transport attempts exhausted                              | extra chunk rounds after 60 s, 120 s (only the missing lines); then `LLM_UNAVAILABLE`                                       |

"Budget spent on reasoning" (`reasoningStarved`): `reasoning_tokens ≥ 50%` of `completion_tokens`; without the field, the visible content (estimated) is under 25% of `completion_tokens`; without `usage`, empty content. Splitting does not help there (every half reasons again and repeats the System Prompt and `<context>`). The budget factor belongs to the lane's `ChunkTranslator` and stays raised for its next chunks (the same model reasons alike; `max_tokens` is a cap, not a charge, though OpenRouter's in-flight budget weighs requests by it), so a job pays at most 2 extra requests per lane. The factor stops at 4× or at the model's `max_completion_tokens`; when it cannot grow any more the job fails with `LLM_REASONING_BUDGET` ("the model spent its output budget on reasoning"), not `LLM_UNAVAILABLE`, and gets no extra rounds.

Every request first takes a slot from the shared `RateLimiter`; attempts, delays and rounds come from the `llm.retry.*` settings (read on every request). Details, defaults and the free-model quota: [`rate-limits.md`](./rate-limits.md).

Lines that exhaust their attempts become `UNTRANSLATED_VALIDATION_FAILED`, stay in the original language and the job ends `completed-with-warnings`. If more than **10%** of the distinct translatable lines (distinct context hashes) fail validation the job stops right away with `LLM_TOO_MANY_FAILURES` (moderated lines do not count; a failed representative fails its copies too but counts once). Everything accepted so far is already in the cache.

## Term consistency pass (`quality/term-consistency.ts`)

Runs at the end of the `translate` step, locally and deterministically (no LLM call). It compares the source and the translated document cue by cue and lists recurring terms rendered in more than one way (e.g. `Bro` → `mano` ×40, `Bro` ×6).

1. **Candidates**: source words capitalized in ≥ 3 cues, at least once mid-sentence (drops sentence-initial "What", "Hey"), and lowercase in ≤ 25% of their occurrences (drops common words). `I`/`OK` forms are ignored, as are all-caps lines (signs) and cues whose translation equals the source (karaoke, signs, failed lines).
2. **Renderings**, per candidate, over the translations of its cues: "kept" when the term itself is there; then, greedily over the cues not covered yet, the target word with the highest Dice coefficient between "cues with the term" and "cues with the word" in the whole file (≥ 0.3, in ≥ 2 cues, not present in the source cue). Common words ("de", "que") have a high document frequency and score low; the actual rendering concentrates on the term's cues. Short inflections are one rendering (`mano`/`manos`). The rendering is shown with its mid-sentence spelling.
3. **Report**: only terms with ≥ 2 renderings, most frequent first (≤ 50 terms, 3 examples per rendering), plus how many cues match none (rephrased/omitted) and the glossary target when the preset already pinned the term.

The report goes to `artifacts.translate.consistency` → `JobResult.consistency` (it does **not** turn the job into `completed-with-warnings`) and one `info` line to the job log. The renderer lists it in the job result, filtered by the **current** glossary of the job's preset (not the one of the job, so pins made afterwards count): a term with an entry (case-insensitive, trimmed; with a `target` or only a `rule`) is not suggested again; if the job's glossary already pinned it (`glossaryTarget`) and the model still varied, it shows only as a warning ("the AI did not follow the glossary"), with nothing to add. The header counts only the suggested terms and the section is hidden when nothing is left. For the rest, the user picks one rendering per term (the most used is preselected) or the explicit "Do not add to the glossary" option after the variants (same as clicking the chosen rendering again: the term is left out and not counted), and saves the choices as `{ source: term, target: rendering }` glossary entries. Saving only **appends** terms the glossary does not have yet (`addNewTerms`): an existing entry, even one added after the suggestions were computed, keeps its target and rule. "Dismiss" (both flows) hides the section for that job without touching the preset: `jobs:dismiss-consistency` sets `result.consistencyDismissed` on the terminal job (persisted, so reopening the job or the queue does not bring it back; a retry produces a new report without the flag). A custom preset is updated in place (`presets:update`). A built-in preset is read-only, so the UI offers to create a new preset right there (`presets:create`): named after the job's media (TMDB title, else a free "copy" name; editable, numbered when taken), with the built-in's media type, style prompt, temperature and glossary plus the chosen terms; further choices then go to that new preset. Linear in the text size: ~6.7k cues in a few tens of ms.

Limits: needs a cased script in the source (Latin, Cyrillic, Greek); a rendering used in a single cue is indistinguishable from noise and is not reported as its own variant. Automatic correction and an LLM review are out of scope.

## Streaming, cancellation and cost

- Requests always stream (`stream: true`). The client accumulates `delta.content`, ignores `: OPENROUTER PROCESSING` keep-alives (they still reset the idle timer), treats a chunk with `error` or `finish_reason: "error"` (HTTP 200) as `stream-error`, and a stream that ends without `[DONE]` or a finish reason as truncated.
- `usage` (tokens, cached tokens, `cost` in credits) comes in the last chunk and is summed in `UsageTotals`.
- Cancellation goes through the `AbortSignal` (request and backoff sleep). A response that already arrived and validated is still written to the cache (it was paid for); the abort only prevents new requests. Aborting stops generation and billing only for providers that support it (OpenAI, Anthropic, DeepSeek, Together…); others (Google, Groq, Mistral, Bedrock…) bill the whole generation. For every interrupted generation (abort, idle timeout, stream error) the session queries `GET /api/v1/generation?id=` (`X-Generation-Id`, after 1.5 s, 5 s timeout, best effort); failures set `costIncomplete: true`. A cancelled job throws `TranslationCancelled` (`AppError` `CANCELLED`) carrying the usage.

## API key and logging

- The key lives encrypted in SQLite (`SecretVault`, see [`database.md`](./database.md)) and is read on every request (`apiKey: () => Promise<string | null>`), so changing it in the UI needs no restart. Missing key → `LLM_AUTH` without any network call.
- The client redacts the key (and any `sk-or-…` token) from every error message. Logs at `info` carry only metadata (model, ids count, finish reason, tokens, cost, status); subtitle content only at `debug` (`response content: …`, truncated to 2 KB).
- Every parse/validation failure logs one `warn` line with the diagnostics, no subtitle text: `model=… mode=json_schema_strict|json_schema|json_object|prompt finish=… out=<completion tokens> reasoning_tokens=… reasoning_streamed=<chars of delta.reasoning>|no chars=<content length>`. Prefixes: `unparseable response (<problem>)`, `invalid lines in response: n/m [<id>:<ISSUE_CODE>(id=…,expected=…,actual=…) <id>:MISSING …]`, `truncated response: recovered|kept n/m lines`.
- The first HTTP error of each lane (one `LlmSession`) also logs its body, redacted and cut at 2 KB: `chat failed body model=… mode=… status=…: …`.
- Request headers: `Authorization`, `Content-Type`, `X-OpenRouter-Title: BakaSub`. No `HTTP-Referer` (attribution only).

## Open points

- Chunk limits, context window and the failure ratio are constants; presets may override them later.
- Explicit `cache_control` breakpoints (Anthropic, Qwen: writes at 1.25×, reads at 0.1×) are not sent yet. Worth it only when the prefix is above the model minimum and the job has enough chunks to amortize the write. A "warm-up" (start one lane, release the others once the first response starts streaming) would make the first K requests cache hits too.
- The preflight does not subtract the cache discount (conservative); the job result does report `cachedTokens`.
