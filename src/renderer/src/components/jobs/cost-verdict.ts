import type { JobResult, JobStatus, PreflightEstimate } from '@shared/ipc-contract'

/**
 * How the actual cost relates to the preflight range. The verdict uses the WHOLE range
 * (`low`–`high`): inside it is `within`; outside, the deviation is relative to the nearest bound.
 *
 * - `free`: free model, nothing was billed (no verdict).
 * - `unavailable`: dynamic pricing, the estimate had no cost (no verdict).
 * - `unfinished`: failed/cancelled/interrupted job, the actual cost covers only what ran.
 * - `partial`: `costIncomplete` with the known part still inside the range: the missing part could
 *   push it anywhere, so no verdict. A known part already above `high` is still `above`.
 */
export type CostVerdict =
  | { kind: 'free' | 'unavailable' | 'unfinished' | 'partial' }
  | {
      kind: 'within' | 'below' | 'above'
      /** Signed % from the nearest bound; `null` when that bound is 0 (no meaningful ratio). */
      deviation: number | null
    }

const UNFINISHED: ReadonlySet<JobStatus> = new Set(['failed', 'cancelled', 'interrupted'])
// OpenRouter returns costs with float noise; anything below a micro-dollar is the same value.
const EPSILON = 1e-6

export const isFreeEstimate = (e: PreflightEstimate): boolean =>
  e.model.pricing !== null && e.model.pricing.prompt === 0 && e.model.pricing.completion === 0

const pct = (actual: number, bound: number): number | null =>
  bound > 0 ? ((actual - bound) / bound) * 100 : null

export function costVerdict(
  estimate: PreflightEstimate,
  usage: JobResult['usage'],
  status: JobStatus
): CostVerdict {
  if (isFreeEstimate(estimate)) return { kind: 'free' }
  if (!estimate.cost) return { kind: 'unavailable' }
  if (UNFINISHED.has(status)) return { kind: 'unfinished' }
  // Nothing sent (everything from the cache): the actual cost is zero.
  const actual = usage?.cost ?? 0
  const { low, high } = estimate.cost
  if (actual > high + EPSILON) return { kind: 'above', deviation: pct(actual, high) }
  if (usage?.costIncomplete) return { kind: 'partial' }
  if (actual < low - EPSILON) return { kind: 'below', deviation: pct(actual, low) }
  return { kind: 'within', deviation: 0 }
}
