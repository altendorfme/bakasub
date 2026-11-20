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
| `chunk-translator.ts`   | translate → validate → accept → repair loop, `length`/moderation splits                             |
| `translate-document.ts` | orchestration of the lanes, failure threshold, drain/cancellation, progress timeline, final doc     |

## Chunks and context

- Only Job Memory **misses** are sent, in timeline order (`HashedUnit.timeIndex`: `start.ms`, file order on ties). Inside a lane chunks run **sequentially**, so each chunk sees the previous translations; lanes run in parallel (next section).
- A chunk holds up to **40 lines or ~2,000 estimated tokens** of `<target>` (`token-estimate.ts`: ~4 chars/token, ~1 per CJK character; for limits only, the preflight uses a real tokenizer, see [`preflight.md`](./preflight.md)). A line larger than the budget goes alone.
- `<context>`: the 5 translatable cues before the chunk (source **and** translation when known, from the cache or an earlier chunk) and 2 after (source only), as plain text without markers.
- `max_tokens` ≈ 2.5 × the target estimate + JSON overhead, at least 256, capped by `top_provider.max_completion_tokens`.

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

- **System** (identical for every chunk of a job: it is the prefix provider prompt caching reuses): the termbase on top (`<glossary>`, whole preset glossary, entries `{source, target?, rule?}`, invalid entries dropped and logged), then the preset style guidance (`<style>`, see [`presets.md`](./presets.md)), then fixed rules in English that always apply (translate only `<target>`, keep every `<gN>…</gN>`/`<xN/>`/`<br/>` exactly once and `<xN/>` in order, no new tags or line breaks, no notes), then the output format, then `<media>` (frozen TMDB details + user notes, see [`media-context.md`](./media-context.md)) as reference. `<media>` lives here, not in each chunk, to make the cacheable prefix longer.
- **User**: `<context>` (`<before>`/`<after>`), `<target>` with `<line id="N">payload</line>`.
- **`session_id`**: every request of one translation carries the same `session_id` (a UUID per `translateDocument` call). OpenRouter's sticky routing then keeps the model on the same provider endpoint, so the automatic prompt cache (OpenAI, DeepSeek, Gemini 2.5+, Grok, Moonshot…) keeps hitting across chunks and lanes. Fallback on provider errors still applies. `cachedTokens` comes back in `usage`.
- **Repair**: same System; for each failing line, `<source>`, what was `<returned>` and the concrete `<problems>` (e.g. `<g1>…</g1> is missing`, `expected exactly 2 <br/>, got 1`).
- Snapshots in `prompt-builder.test.ts` pin the exact text.

## Output

`{ "<cueId>": "<translated payload>" }`. Mode chosen per model from the catalog:

1. `structured_outputs` → `response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }` with exactly the chunk ids as required properties and `additionalProperties: false`, plus `provider.require_parameters: true` (support is per endpoint, not per model).
2. `response_format` → `{ type: 'json_object' }`.
3. Neither → prompt only.

Always parsed with the same two layers: tolerant extraction (code fences, prose around, first balanced object) + Zod shape (extra ids ignored and logged; missing or non-string ids are failures), then `validateTranslation` per line.

## Retries

| Failure                                                   | Policy                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| line fails validation / missing from the answer           | accept the valid lines (written to the cache), repair only the failing ones; ≤ 3 attempts per line      |
| unparseable JSON                                          | counts as an attempt for every pending line; retried with the translate prompt                          |
| `finish_reason: length`                                   | split the chunk in half (no content attempt spent)                                                      |
| moderation (403 / `content_filter`)                       | split until isolated (≤ 3 levels); blocked lines → `UNTRANSLATED_CONTENT_FILTERED`                      |
| 429                                                       | the whole lane cools down (`Retry-After`, else `X-RateLimit-Reset`, else backoff; ≤ 60 s); ≤ 5 attempts |
| 429 free-model daily quota                                | fail the job: `LLM_DAILY_LIMIT` (reset time in the message)                                             |
| 503                                                       | backoff 1 s…30 s with jitter, this request only; ≤ 5 attempts                                           |
| 408 / 5xx / error inside the stream / 60 s idle / network | backoff; ≤ 3 attempts                                                                                   |
| 401 / 402 (or 403 budget) / 400                           | fail the job: `LLM_AUTH` / `LLM_CREDITS` / `LLM_BAD_REQUEST`                                            |
| transport attempts exhausted                              | extra chunk rounds after 60 s, 120 s (only the missing lines); then `LLM_UNAVAILABLE`                   |

Every request first takes a slot from the shared `RateLimiter`; attempts, delays and rounds come from the `llm.retry.*` settings (read on every request). Details, defaults and the free-model quota: [`rate-limits.md`](./rate-limits.md).

Lines that exhaust their attempts become `UNTRANSLATED_VALIDATION_FAILED`, stay in the original language and the job ends `completed-with-warnings`. If more than **10%** of the translatable lines fail validation the job stops right away with `LLM_TOO_MANY_FAILURES` (moderated lines do not count). Everything accepted so far is already in the cache.

## Streaming, cancellation and cost

- Requests always stream (`stream: true`). The client accumulates `delta.content`, ignores `: OPENROUTER PROCESSING` keep-alives (they still reset the idle timer), treats a chunk with `error` or `finish_reason: "error"` (HTTP 200) as `stream-error`, and a stream that ends without `[DONE]` or a finish reason as truncated.
- `usage` (tokens, cached tokens, `cost` in credits) comes in the last chunk and is summed in `UsageTotals`.
- Cancellation goes through the `AbortSignal` (request and backoff sleep). A response that already arrived and validated is still written to the cache (it was paid for); the abort only prevents new requests. Aborting stops generation and billing only for providers that support it (OpenAI, Anthropic, DeepSeek, Together…); others (Google, Groq, Mistral, Bedrock…) bill the whole generation. For every interrupted generation (abort, idle timeout, stream error) the session queries `GET /api/v1/generation?id=` (`X-Generation-Id`, after 1.5 s, 5 s timeout, best effort); failures set `costIncomplete: true`. A cancelled job throws `TranslationCancelled` (`AppError` `CANCELLED`) carrying the usage.

## API key and logging

- The key lives encrypted in SQLite (`SecretVault`, see [`database.md`](./database.md)) and is read on every request (`apiKey: () => Promise<string | null>`), so changing it in the UI needs no restart. Missing key → `LLM_AUTH` without any network call.
- The client redacts the key (and any `sk-or-…` token) from every error message. Logs at `info` carry only metadata (model, ids count, finish reason, tokens, cost, status); responses that fail parsing/validation are logged truncated (2 KB) at `warn`; subtitle content otherwise only at `debug`.
- Request headers: `Authorization`, `Content-Type`, `X-OpenRouter-Title: BakaSub`. No `HTTP-Referer` (attribution only).

## Open points

- Chunk limits, context window and the failure ratio are constants; presets may override them later.
- Explicit `cache_control` breakpoints (Anthropic, Qwen: writes at 1.25×, reads at 0.1×) are not sent yet. Worth it only when the prefix is above the model minimum and the job has enough chunks to amortize the write. A "warm-up" (start one lane, release the others once the first response starts streaming) would make the first K requests cache hits too.
- The preflight does not subtract the cache discount (conservative); the job result does report `cachedTokens`.
