import type { LogEntry, LogLevel } from '../../shared/ipc-contract'

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']
const MAX_DETAIL = 16_000

/** electron-log also has `verbose`/`silly`: both are debug noise for us. */
function normalizeLevel(l: string): LogLevel {
  if ((LOG_LEVELS as readonly string[]).includes(l)) return l as LogLevel
  return l === 'verbose' || l === 'silly' ? 'debug' : 'info'
}

function describe(v: unknown): string {
  if (v instanceof Error) {
    const code = (v as { code?: unknown }).code
    return `${code ? `[${String(code)}] ` : ''}${v.stack ?? `${v.name}: ${v.message}`}`
  }
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}

/** The fields of an electron-log message that matter, plus the job id from the async context. */
export interface RawLogMessage {
  date: Date
  level: string
  scope?: string
  data: readonly unknown[]
  jobId?: string
}

/** First string argument is the message; everything else is detail (errors with code + stack). */
export function toLogEntry(m: RawLogMessage): LogEntry {
  const [first, ...rest] = m.data
  const msg =
    typeof first === 'string' ? first : first instanceof Error ? first.message : describe(first)
  const extra = typeof first === 'string' ? rest : first instanceof Error ? [first, ...rest] : rest
  let detail = extra.map(describe).join('\n')
  if (detail.length > MAX_DETAIL) detail = `${detail.slice(0, MAX_DETAIL)}…(truncated)`
  return {
    time: m.date.toISOString(),
    level: normalizeLevel(m.level),
    scope: m.scope || 'app',
    msg,
    ...(m.jobId ? { jobId: m.jobId } : {}),
    ...(detail ? { detail } : {})
  }
}

/** One JSON object per line (JSON escapes newlines, so an entry never spans lines). */
export const serializeEntry = (e: LogEntry): string => JSON.stringify(e)

const LEGACY = /^\[([^\]]+)\] \[(\w+)\](?: +\(([^)]+)\))? ?(.*)$/

/** JSON lines; plain-text lines from the old format still show up, best effort. */
export function parseLogLine(line: string): LogEntry | null {
  const t = line.trim()
  if (!t) return null
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as Partial<LogEntry>
      if (typeof o.msg === 'string' && typeof o.time === 'string')
        return {
          time: o.time,
          level: normalizeLevel(String(o.level)),
          scope: typeof o.scope === 'string' ? o.scope : 'app',
          msg: o.msg,
          ...(typeof o.jobId === 'string' ? { jobId: o.jobId } : {}),
          ...(typeof o.detail === 'string' ? { detail: o.detail } : {})
        }
    } catch {
      // not JSON after all
    }
  }
  const m = LEGACY.exec(t)
  if (m) return { time: m[1], level: normalizeLevel(m[2]), scope: m[3] ?? 'app', msg: m[4] }
  return { time: '', level: 'info', scope: 'app', msg: t }
}
