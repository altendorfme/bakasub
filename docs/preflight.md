# Preflight (cost estimate)

Before any LLM call, every `translate` / `pipeline` job estimates tokens and cost, shows what will not be translated (coverage) and, by default, waits for the user to confirm. Code: `src/main/preflight/` and the `preflight` job step.

```
probe → extract → preflight ──► decision
                                 ├─ auto-confirmed ─────────► translate → …
                                 └─ needs-confirmation ─► awaiting-confirmation (slot released)
                                         jobs:confirm / batches:confirm ─► queued ─► translate → …
                                         jobs:cancel ─► cancelled
```

## How the estimate is computed (`estimate.ts`)

It simulates the real requests with the **same production code**: Job Memory lookup in `peek` mode (does not touch `last_used_at`, so a cancelled preflight never keeps stale entries alive), `planLanes` over the misses (representatives only: `lines.copies` counts the lines filled from another one with the same context hash, which cost no request or token) with the same `llm.concurrency.perJob` (each lane simulated with only the cache and its own translations, as in the parallel run), `buildContext`, the real System Prompt (glossary included) and translate messages, and the strict JSON Schema when the model uses structured outputs. Translations not known yet are filled in the context with the source text (similar length). Deterministic.

- **Input tokens**: per chunk, `countMessageTokens([system, user])` (+4 per message, +3 reply priming) + the JSON Schema.
- **Output tokens**: target payload tokens × 1.2 + 8 per line (JSON keys/quotes).
- **Range**: `high = base × 1.15` (repairs and retries). The provider's prompt-cache discount is **not** subtracted (conservative).
- **Tokenizer** (`token-counter.ts`): `js-tiktoken` `o200k_base` (pure JS, lazily loaded). Exact only for models whose `architecture.tokenizer` is `GPT`; for every other family the result is `approximate: true` and the range widens to `low × 0.8 … base × 1.15 × 1.2`.
- **Cost**: tokens × `pricing` from the model catalog (USD per token, refreshed when older than 24 h). `pricing: null` (dynamic price) → `cost: null`; auto-confirm never applies then. The estimate records the price used and the catalog date.

## Decision

| Condition                                                                      | Decision             |
| ------------------------------------------------------------------------------ | -------------------- |
| `confirmBeforeTranslate: false` (job option, default `true`)                   | `auto-confirmed`     |
| setting `preflight.autoConfirmBelowUsd` set and `cost.high` below it (per job) | `auto-confirmed`     |
| otherwise                                                                      | `needs-confirmation` |

A job whose lines are all in the cache still stops for review (unless the threshold applies): the screen says nothing will be sent to the AI and shows the coverage.

**Ignore saved translations.** The job's `memory` (`spec.memory`, see [`job-memory.md`](./job-memory.md)) goes into `Preflighter.run`. With `skip`, the lookup returns no hits, so the estimate has `lines.cached: 0` and the full cost (same numbers as a cold cache), and `estimate.memory: 'skip'` makes the review say "cache ignored". Estimates of older jobs have no `memory`.

**Switching it during the review** (`jobs:set-memory`, only in `awaiting-confirmation`): the spec is updated, the `preflight` artifact is dropped and `artifacts.reestimate = true` is set, and the job goes back to the queue. The preflight runs again and, because of `reestimate`, always ends in `needs-confirmation`, even when the new cost is below `preflight.autoConfirmBelowUsd`: the user is looking at the review and must not see the job start on its own. The marker is consumed by the step. Same choice → no-op.

`jobs:confirm` sets it to `confirmed` and re-queues the job; the runner resumes at `translate` from the stored artifacts (no re-extraction, no new estimate). `awaiting-confirmation` is not running: it frees the queue slot and survives an app restart unchanged.

## Results

- `job.result.preflight`: `PreflightEstimate` (model and price, `approximate`, lines total/cached/to translate/chunks, `memory`, input/output token ranges, cost range, decision). Small enough for `jobs:list`.
- `jobs:preflight(id)`: the estimate plus the full `CoverageReport` (what will not be translated, where and why; capped at 500 entries) and `prompt: PromptSummary`.
- `PromptSummary` (`src/main/jobs/steps/prompt-summary.ts`): the exact system prompt the `translate` step will send (same `buildSystemPrompt` and inputs, so it is deterministic), its o200k token count, and which blocks went in: glossary entries, preset style, TMDB details, episode synopsis, user notes, plus `media.unavailable` when the user chose TMDB context that could not be fetched. Stored in `artifacts.preflight.prompt`; absent on jobs created before it existed. The job detail shows it both in the review and after the job ends.
- Batches: `Batch.preflight` sums the jobs waiting for confirmation (`awaiting`, `toTranslate`, `cost` — `null` if any job has a dynamic price — and `approximate`); `batches:confirm` confirms them all.
