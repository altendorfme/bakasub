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

It simulates the real requests with the **same production code**: Job Memory lookup in `peek` mode (does not touch `last_used_at`, so a cancelled preflight never keeps stale entries alive), `planChunks` over the misses, `buildContext`, the real System Prompt (glossary included) and translate messages, and the strict JSON Schema when the model uses structured outputs. Translations not known yet are filled in the context with the source text (similar length). Deterministic.

- **Input tokens**: per chunk, `countMessageTokens([system, user])` (+4 per message, +3 reply priming) + the JSON Schema.
- **Output tokens**: target payload tokens × 1.2 + 8 per line (JSON keys/quotes).
- **Range**: `high = base × 1.15` (repairs and retries). The provider's prompt-cache discount is **not** subtracted (conservative).
- **Tokenizer** (`token-counter.ts`): `js-tiktoken` `o200k_base` (pure JS, lazily loaded). Exact only for models whose `architecture.tokenizer` is `GPT`; for every other family the result is `approximate: true` and the range widens to `low × 0.8 … base × 1.15 × 1.2`.
- **Cost**: tokens × `pricing` from the model catalog (USD per token, refreshed when older than 24 h). `pricing: null` (dynamic price) → `cost: null`; auto-confirm never applies then. The estimate records the price used and the catalog date.

## Decision

| Condition                                                                      | Decision             |
| ------------------------------------------------------------------------------ | -------------------- |
| `confirmBeforeTranslate: false` (job option, default `true`)                   | `auto-confirmed`     |
| nothing to translate (all lines cached)                                        | `auto-confirmed`     |
| setting `preflight.autoConfirmBelowUsd` set and `cost.high` below it (per job) | `auto-confirmed`     |
| otherwise                                                                      | `needs-confirmation` |

`jobs:confirm` sets it to `confirmed` and re-queues the job; the runner resumes at `translate` from the stored artifacts (no re-extraction, no new estimate). `awaiting-confirmation` is not running: it frees the queue slot and survives an app restart unchanged.

## Results

- `job.result.preflight`: `PreflightEstimate` (model and price, `approximate`, lines total/cached/to translate/chunks, input/output token ranges, cost range, decision). Small enough for `jobs:list`.
- `jobs:preflight(id)`: the estimate plus the full `CoverageReport` (what will not be translated, where and why; capped at 500 entries).
- Batches: `Batch.preflight` sums the jobs waiting for confirmation (`awaiting`, `toTranslate`, `cost` — `null` if any job has a dynamic price — and `approximate`); `batches:confirm` confirms them all.
