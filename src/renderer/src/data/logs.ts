import { useEffect, useState } from 'react'
import type { LogEntry, LogLevel } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']
const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
/** Lines kept on screen (tail + live). */
export const MAX_LOG_LINES = 2000

export interface LogFilter {
  minLevel: LogLevel
  scope: string | null
  jobId: string | null
}

export const matchesLog = (e: LogEntry, f: LogFilter): boolean =>
  RANK[e.level] >= RANK[f.minLevel] &&
  (f.scope === null || e.scope === f.scope) &&
  (f.jobId === null || e.jobId === f.jobId)

/**
 * The last lines from the log file, then live lines (`logs:watch` on while mounted).
 * Filtering is local so changing it never loses the live lines.
 */
export function useLiveLogs(live: boolean): {
  entries: LogEntry[]
  loading: boolean
  error: unknown
} {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    unwrap(window.api.logs.tail({ limit: 1000, minLevel: 'debug' })).then(
      (tail) => {
        if (cancelled) return
        setEntries(tail)
        setLoading(false)
      },
      (err: unknown) => {
        if (cancelled) return
        setError(err)
        setLoading(false)
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!live) return
    void window.api.logs.watch(true)
    const off = window.api.events.on('logs:entry', (batch) =>
      setEntries((prev) => [...prev, ...batch].slice(-MAX_LOG_LINES))
    )
    return () => {
      off()
      void window.api.logs.watch(false)
    }
  }, [live])

  return { entries, loading, error }
}
