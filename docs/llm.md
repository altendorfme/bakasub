# LLM translation layer

`src/main/llm/` turns a parsed subtitle document into a translated one through OpenRouter. It is pure Node (no `electron` import) and fully injectable: `translateDocument(input, deps, { signal, onProgress })`. The Job Manager ([`jobs.md`](./jobs.md)) wraps it in the `translate` step.

```
translateDocument
  ├─ models.find(preset.model)              → LLM_UNKNOWN_MODEL if absent
  ├─ memory.lookupDocument(doc)              → validated hits + misses (see job-memory.md)
  ├─ planChunks(misses)                      → sequential chunks, timeline order
  └─ for each chunk: ChunkTranslator.run
        ├─ PromptBuilder (system + <context>/<target> | repair)
        ├─ LlmSession.request                → transport retry, structured output, usage
        ├─ parseTranslations (Zod)           → validateTranslation per line
        ├─ accept valid → memory.commitChunk (one transaction)
        └─ repair only the invalid lines (≤ 3 attempts per line)
  → applyTranslation on every known cue → { doc, failed, usage, cache, status }
```

| Module                  | Responsibility                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `sse.ts`                | incremental WHATWG SSE decoder (bytes split anywhere, CR/LF/CRLF, comments, BOM)                   |
| `openrouter-client.ts`  | Chat Completions over SSE, error classification (`LlmError.kind`), idle timeout, key redaction     |
| `model-catalog.ts`      | `/api/v1/models` normalized to `ModelInfo`, cached in `settings` (24 h, offline fallback)          |
| `retry-policy.ts`       | transport decision per error kind and attempt (pure, configurable)                                 |
| `rate-limiter.ts`       | process-wide sliding window per lane (free/paid) and lane cooldown after a 429                     |
| `free-quota.ts`         | free-model daily quota from `GET /api/v1/key`, tier override                                       |
| `llm-session.ts`        | one job ↔ one model: request + retry + output mode + usage, cost lookup of interrupted generations |
| `chunker.ts`            | chunk planning and the context window                                                              |
| `prompt-builder.ts`     | glossary parsing, System Prompt, translate/repair messages, strict JSON Schema                     |
| `response-parser.ts`    | tolerant JSON extraction + Zod shape check                                                         |
| `chunk-translator.ts`   | translate → validate → accept → repair loop, `length`/moderation splits                            |
| `translate-document.ts` | orchestration, failure threshold, cancellation, final document                                     |

## Chunks and context

- Only Job Memory **misses** are sent. Chunks run **sequentially** in timeline order (`HashedUnit.timeIndex`: `start.ms`, file order on ties), so each chunk sees the previous translations: consistency of names and forms of address beats speed. Parallelism belongs between jobs.
- A chunk holds up to **40 lines or ~2,000 estimated tokens** of `<target>` (`token-estimate.ts`: ~4 chars/token, ~1 per CJK character; for limits only, the preflight uses a real tokenizer, see [`preflight.md`](./preflight.md)). A line larger than the budget goes alone.
- `<context>`: the 5 translatable cues before the chunk (source **and** translation when known, from the cache or an earlier chunk) and 2 after (source only), as plain text without markers.
- `max_tokens` ≈ 2.5 × the target estimate + JSON overhead, at least 256, capped by `top_provider.max_completion_tokens`.

## Prompt

- **System** (identical for every chunk of a job, which helps provider prompt caching): the termbase on top (`<glossary>`, whole preset glossary, entries `{source, target?, rule?}`, invalid entries dropped and logged), then the preset style guidance (`<style>`, see [`presets.md`](./presets.md)), then fixed rules in English that always apply (translate only `<target>`, keep every `<gN>…</gN>`/`<xN/>`/`<br/>` exactly once and `<xN/>` in order, no new tags or line breaks, no notes), then the output format.
- **User**: `<media>` (frozen TMDB details + user notes, see [`media-context.md`](./media-context.md)), `<context>` (`<before>`/`<after>`), `<target>` with `<line id="N">payload</line>`.
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
