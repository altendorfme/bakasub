# Rate limits and retries

How BakaSub paces its requests to OpenRouter and what happens when a request fails. Code: `src/main/llm/` (`rate-limiter.ts`, `retry-policy.ts`, `llm-session.ts`, `free-quota.ts`, `translate-document.ts`). User guide (in-app, en/pt-BR): [`openrouter-limits.md`](../src/renderer/src/guides/en/openrouter-limits.md).

## OpenRouter limits (what we design for)

| Model                         | Per minute      | Per day (UTC)                                                     |
| ----------------------------- | --------------- | ----------------------------------------------------------------- |
| `:free` variants (or price 0) | 20 requests     | 50 if the account bought < US$ 10 of credits (ever), 1000 if ≥ 10 |
| paid                          | no platform cap | none; the upstream provider may answer 429                        |

Paid requests also hold an **in-flight budget** on prepaid accounts: each running request reserves its estimated cost (input + `max_tokens`) from the balance; when the reservations do not fit, OpenRouter answers **402 `in_flight_budget_exhausted`** with `Retry-After` (`weight_exceeds_budget` means a single request is too big for the balance). Parallel lanes make this reachable with a low balance.

Limits are **per account**: more keys do not raise them. `GET /api/v1/key` reports `free_model_daily_requests { used, limit, remaining }` (not the per-minute limit). OpenRouter-generated 429s carry `X-RateLimit-Limit/Remaining/Reset` (reset in epoch ms); a 429 can also arrive inside the stream as an SSE `error` event with `code: 429`.

## Layers

```
translateDocument
  └─ K lanes in parallel, each a chunk loop ── extra rounds (60 s, 120 s…) when retries are exhausted
       └─ ChunkTranslator ── content attempts (translate + 2 repairs), length/moderation splits
            └─ LlmSession.request
                 ├─ RateLimiter.acquire(lane) → Lease   ← process-wide, shared by all jobs
                 │    (cooldown → rpm window → in-flight slot under the AIMD limit)
                 ├─ OpenRouterClient.chat
                 ├─ lease.release('ok' | 'throttled' | 'other')   ← before any wait
                 └─ decide(err, attempt, config)
                      ├─ 429 / 402 in-flight → limiter.cooldown(lane, until)  (every job waits)
                      ├─ 503 / 5xx…          → sleep(backoff)                (this request only)
                      └─ fatal               → FatalLlmError (LLM_AUTH, LLM_CREDITS, LLM_DAILY_LIMIT…)
```

- **Lanes** (`laneOf`): `free` = id ends with `:free` or prompt and completion prices are 0; `paid` = everything else, including dynamic pricing (routers).
- **`RateLimiter`**: one instance in the Main (`createJobModule`), a 60 s sliding window per lane plus a lane cooldown. Waiters are served in arrival order; a cancelled wait does not consume a slot. The config is read on every `acquire`, so changes in Settings apply to running jobs.
- **In-flight cap** (`llm.concurrency.*MaxInFlight`): at most N requests of the lane run at once, summing every job. `acquire` returns a `Lease`; `LlmSession` releases it as soon as the response or the error arrives, **before** any backoff, so a waiting request never holds a slot. Waiting for a slot is not reported as `waiting` (it is parallelism, not OpenRouter holding back). A cancelled wait does not take a slot.
- **AIMD** below the cap: the effective limit starts at the cap, halves on `throttled` (429 or 402 `in_flight_budget_exhausted`), and grows +1 after 5 consecutive successes. **One decrease per burst**: every lease records the limiter's epoch; a `throttled` from a lease taken before the last decrease is ignored, so 8 simultaneous 429s halve once (8 → 4), not down to 1. Without a configured cap the decrease halves what was actually in flight. After 5 min idle the lane goes back to the cap.
- **Cooldown**: a 429 pauses the whole lane until `Retry-After`, else `X-RateLimit-Reset`, else the exponential backoff (capped at 60 s). A later, shorter cooldown never shortens an earlier one. 503 is usually the model or provider, not the account, so it only delays its own request.
- **402 `in_flight_budget_exhausted`** (`LlmError.kind = 'budget-busy'`, also a 403 with `limit_source: openrouter_in_flight_budget`): retried like a 429 (lane cooldown, `maxThrottled` attempts) and lowers AIMD. Any other 402 is still `credits` → `LLM_CREDITS`, fatal.
- **404 "No endpoints found…"** (`unsupported-params`): deterministic, never retried with the same request. `LlmSession` steps the job's output mode down instead (no backoff, no attempt spent); see [`llm.md`](./llm.md#output). With no step left: `LLM_NO_ENDPOINT`, fatal.
- **Daily quota**: a 429 with `X-RateLimit-Remaining: 0` and a limit ≥ 50 (or a reset more than 10 min away) is `daily-limit` → `LLM_DAILY_LIMIT`, no retry; the message carries the reset time. Lines already accepted are in Job Memory, so retrying the job after the reset continues where it stopped.
- **Chunk rounds**: when an exhausted transport retry ends in `LLM_UNAVAILABLE`, the chunk gets `chunkRounds` extra rounds after 60 s, 120 s…, sending only the lines that are still missing. Network errors never turn lines into "untranslated": the job fails and can be retried.

## Settings (Settings → Advanced, not in the wizard)

| Key                               | Default | Range                     | Meaning                                                                                |
| --------------------------------- | ------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `llm.rateLimit.freeRpm`           | 20      | 1–60                      | requests per minute, free lane                                                         |
| `llm.rateLimit.paidRpm`           | `null`  | 1–1000 or null            | requests per minute, paid lane (`null` = no cap)                                       |
| `llm.rateLimit.freeTier`          | `auto`  | auto / under-10 / over-10 | daily quota tier; `auto` reads `GET /key`                                              |
| `llm.retry.maxThrottled`          | 5       | 1–10                      | attempts on 429/502/503                                                                |
| `llm.retry.maxTransient`          | 3       | 1–10                      | attempts on 5xx, timeout, stream error, network                                        |
| `llm.retry.baseDelayMs`           | 1000    | 250–10000                 | first backoff (then ×2 per attempt, jitter 50–100%)                                    |
| `llm.retry.maxDelayMs`            | 30000   | 1000–120000               | backoff cap (`baseDelayMs > maxDelayMs` → `SETTINGS_CONFLICT`)                         |
| `llm.retry.chunkRounds`           | 2       | 0–5                       | extra rounds per chunk after transport retries are exhausted                           |
| `llm.concurrency.perJob`          | 4       | 1–8 (recommended 2–4)     | lanes per file (`1` = sequential); see [`llm.md`](./llm.md#lanes-parallel-translation) |
| `llm.concurrency.paidMaxInFlight` | 8       | 1–32 (recommended 4–12)   | requests in flight at once on the paid lane, all jobs                                  |
| `llm.concurrency.freeMaxInFlight` | 3       | 1–10 (recommended 2–3)    | same for the free lane (20 req/min makes more pointless)                               |

The recommended bands live in `CONCURRENCY_RECOMMENDED` (`shared/ipc-contract.ts`). The UI draws them on a small track under each field and warns, without blocking, when a value leaves the band (below: slower; above: more cuts, 429s or 402s). It also warns when `jobs.concurrency × perJob` exceeds `paidMaxInFlight` (lanes would wait for a slot).

`settings:reset { keys }` restores factory defaults ("Restore defaults"), going through the same rules as `settings:update`.

## Free quota (`FreeQuota`, `models:free-quota`)

`status()` → `FreeQuotaStatus { tier, source, limit, used, remaining }`. `auto`: from `GET /key` (cached 30 s; invalidated when the API key or the tier setting changes); without an answer (no key, offline) the tier is `unknown` and the limit is assumed to be 50. An override fixes the limit and still uses `used` from `/key` when available.

The preflight adds `freeQuota { …status, requests, enough }` for free models, where `requests = ceil(chunks × 1.25)` (repairs and rounds). `enough: false` never blocks: it forces `needs-confirmation` (a free job costs US$ 0 and would otherwise auto-confirm) and adds a job warning. With `confirmBeforeTranslate: false` (batch) only the warning remains.

## Visible waits

`JobProgress.waiting?: { reason: 'rate-limit' | 'cooldown' | 'backoff', untilMs }` is set while **every running lane** of a job waits (earliest resume time) and cleared when a request goes out (never kept in a terminal state). `rate-limit` = per-minute window, `cooldown` = recent 429 on the lane (all jobs on that lane show it), `backoff` = retry after an error or before an extra chunk round.
