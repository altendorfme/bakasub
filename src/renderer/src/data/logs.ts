import { useEffect, useRef, useState } from 'react'
import type { LogEntry, LogLevel } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']
const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
/** Lines kept on screen (tail + live). */
export const MAX_LOG_LINES = 2000
/** History loaded for the general view (newest lines of every job). */
export const GENERAL_TAIL_LINES = 1000

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
 * History, then live lines (`logs:watch` on while mounted and `live`).
 *
 * - `jobId === null`: the last {@link GENERAL_TAIL_LINES} lines of every job.
 * - `jobId` set: the Main filters by job across every rotated file, so an old job is complete
 *   (up to {@link MAX_LOG_LINES}) instead of being whatever survived in the global tail. Live
 *   lines of other jobs are dropped on arrival.
 *
 * Always `minLevel: 'debug'`: level and area are filtered on screen, so changing them never
 * loses lines. Live lines that arrive while the history is loading are kept and appended after
 * it (those already in it, by time, are skipped).
 */
export function useLiveLogs(
  live: boolean,
  jobId: string | null = null
): {
  entries: LogEntry[]
  loading: boolean
  error: unknown
} {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  // Live lines received while the history request is in flight (null once it resolved).
  const pending = useRef<LogEntry[] | null>(null)
  const jobRef = useRef(jobId)
  // Another job (or none): start over, during render so the old lines never flash.
  const [loadedFor, setLoadedFor] = useState(jobId)
  if (loadedFor !== jobId) {
    setLoadedFor(jobId)
    setEntries([])
    setError(null)
    setLoading(true)
  }

  useEffect(() => {
    jobRef.current = jobId
    let cancelled = false
    pending.current = []
    const query = jobId
      ? { jobId, limit: MAX_LOG_LINES, minLevel: 'debug' as const }
      : { limit: GENERAL_TAIL_LINES, minLevel: 'debug' as const }
    unwrap(window.api.logs.tail(query)).then(
      (tail) => {
        if (cancelled) return
        const last = tail.at(-1)?.time ?? ''
        const arrived = (pending.current ?? []).filter((e) => e.time > last)
        pending.current = null
        setEntries([...tail, ...arrived].slice(-MAX_LOG_LINES))
        setLoading(false)
      },
      (err: unknown) => {
        if (cancelled) return
        pending.current = null
        setError(err)
        setLoading(false)
      }
    )
    return () => {
      cancelled = true
    }
  }, [jobId])

  useEffect(() => {
    if (!live) return
    void window.api.logs.watch(true)
    const off = window.api.events.on('logs:entry', (batch) => {
      const job = jobRef.current
      const mine = job ? batch.filter((e) => e.jobId === job) : batch
      if (mine.length === 0) return
      if (pending.current) pending.current.push(...mine)
      else setEntries((prev) => [...prev, ...mine].slice(-MAX_LOG_LINES))
    })
    return () => {
      off()
      void window.api.logs.watch(false)
    }
  }, [live])

  return { entries, loading, error }
}
