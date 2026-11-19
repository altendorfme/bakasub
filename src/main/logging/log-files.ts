import { existsSync, renameSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { parse, join } from 'node:path'
import type { LogEntry, LogLevel } from '../../shared/ipc-contract'
import { LOG_LEVELS, parseLogLine } from './log-entry'

const archivePath = (file: string, n: number): string => {
  const p = parse(file)
  return join(p.dir, `${p.name}.${n}${p.ext}`)
}

/**
 * Size-based rotation for electron-log's `archiveLogFn`: `main.log` -> `main.1.log` -> … and
 * the oldest beyond `keep` files in total is deleted. Synchronous: electron-log writes sync.
 */
export function rotateLogs(file: string, keep: number): void {
  const oldest = archivePath(file, keep - 1)
  if (existsSync(oldest)) rmSync(oldest, { force: true })
  for (let n = keep - 2; n >= 1; n--) {
    const from = archivePath(file, n)
    if (existsSync(from)) renameSync(from, archivePath(file, n + 1))
  }
  if (existsSync(file)) renameSync(file, archivePath(file, 1))
}

/** Current file first, then the archives that exist (newest to oldest). */
export function archiveFiles(file: string, keep: number): string[] {
  const out = existsSync(file) ? [file] : []
  for (let n = 1; n < keep; n++) {
    const p = archivePath(file, n)
    if (existsSync(p)) out.push(p)
  }
  return out
}

export interface TailQuery {
  limit: number
  keep: number
  minLevel?: LogLevel
  scopes?: readonly string[]
  jobId?: string
}

/**
 * Last `limit` entries matching the filter, oldest first, reading the current file and then the
 * archives. Files are at most a few MB, so each one is read whole.
 */
export async function readLogTail(file: string, q: TailQuery): Promise<LogEntry[]> {
  const min = LOG_LEVELS.indexOf(q.minLevel ?? 'debug')
  const match = (e: LogEntry): boolean =>
    LOG_LEVELS.indexOf(e.level) >= min &&
    (!q.scopes || q.scopes.includes(e.scope)) &&
    (!q.jobId || e.jobId === q.jobId)

  const newestFirst: LogEntry[] = []
  for (const path of archiveFiles(file, q.keep)) {
    const text = await readFile(path, 'utf8').catch(() => '')
    const lines = text.split('\n')
    for (let i = lines.length - 1; i >= 0 && newestFirst.length < q.limit; i--) {
      const e = parseLogLine(lines[i])
      if (e && match(e)) newestFirst.push(e)
    }
    if (newestFirst.length >= q.limit) break
  }
  return newestFirst.reverse()
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * All log files as one text, oldest first, ready to be attached to an issue: secrets redacted
 * again and the home folder replaced by `~` (raw, `/` and JSON-escaped `\\` spellings).
 */
export async function readLogsForExport(
  file: string,
  o: { keep: number; home: string; redactor: { text(s: string): string } }
): Promise<string> {
  const parts: string[] = []
  for (const path of archiveFiles(file, o.keep).reverse())
    parts.push(await readFile(path, 'utf8').catch(() => ''))
  let text = o.redactor.text(parts.join(''))
  const home = o.home.replace(/[\\/]+$/, '')
  if (home.length > 1) {
    const variants = new Set([home, home.replaceAll('\\', '/'), home.replaceAll('\\', '\\\\')])
    for (const v of [...variants].sort((a, b) => b.length - a.length))
      text = text.replace(new RegExp(escapeRe(v), 'gi'), '~')
  }
  return text
}
