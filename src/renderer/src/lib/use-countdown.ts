import { useEffect, useReducer } from 'react'

/** Whole seconds until `untilMs` (epoch), re-rendering once per second; `null` without a target. */
export function useCountdown(
  untilMs: number | undefined,
  now: () => number = Date.now
): number | null {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (untilMs === undefined) return
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [untilMs])
  return untilMs === undefined ? null : Math.max(0, Math.ceil((untilMs - now()) / 1000))
}
