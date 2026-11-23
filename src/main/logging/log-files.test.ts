import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LogEntry } from '../../shared/ipc-contract'
import { serializeEntry } from './log-entry'
import { archiveFiles, readLogTail, readLogsForExport, rotateLogs } from './log-files'
import { Redactor } from './redact'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bakasub-logs-'))
  file = join(dir, 'main.log')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const entry = (i: number, over: Partial<LogEntry> = {}): LogEntry => ({
  time: new Date(Date.UTC(2026, 10, 19, 10, 0, i)).toISOString(),
  level: 'info',
  scope: 'app',
  msg: `m${i}`,
  ...over
})
const lines = (es: LogEntry[]): string => es.map(serializeEntry).join('\n') + '\n'

describe('rotateLogs', () => {
  it('shifts main.log -> main.1.log -> … and drops the oldest beyond `keep`', () => {
    for (const [name, body] of [
      ['main.log', 'current'],
      ['main.1.log', 'one'],
      ['main.2.log', 'two'],
      ['main.3.log', 'three'],
      ['main.4.log', 'four']
    ])
      writeFileSync(join(dir, name), body)
    rotateLogs(file, 5)
    expect(existsSync(file)).toBe(false)
    expect(readFileSync(join(dir, 'main.1.log'), 'utf8')).toBe('current')
    expect(readFileSync(join(dir, 'main.4.log'), 'utf8')).toBe('three')
    expect(existsSync(join(dir, 'main.5.log'))).toBe(false)
  })

  it('works with gaps and with nothing to shift', () => {
    writeFileSync(file, 'current')
    rotateLogs(file, 5)
    expect(readFileSync(join(dir, 'main.1.log'), 'utf8')).toBe('current')
  })

  it('archiveFiles lists current first, then 1..keep-1 that exist', () => {
    writeFileSync(file, '')
    writeFileSync(join(dir, 'main.2.log'), '')
    expect(archiveFiles(file, 5)).toEqual([file, join(dir, 'main.2.log')])
  })
})

describe('readLogTail', () => {
  it('returns the last N entries, oldest first, across rotated files', async () => {
    writeFileSync(join(dir, 'main.1.log'), lines([entry(1), entry(2), entry(3)]))
    writeFileSync(file, lines([entry(4), entry(5)]))
    const out = await readLogTail(file, { limit: 3, keep: 5 })
    expect(out.map((e) => e.msg)).toEqual(['m3', 'm4', 'm5'])
  })

  it('filters by minimum level, scopes and job id before counting', async () => {
    writeFileSync(
      file,
      lines([
        entry(1, { level: 'debug' }),
        entry(2, { level: 'warn', scope: 'llm', jobId: 'j1' }),
        entry(3, { level: 'error', scope: 'sidecar', jobId: 'j2' }),
        entry(4, { level: 'info', scope: 'llm', jobId: 'j1' })
      ])
    )
    expect(
      (await readLogTail(file, { limit: 10, keep: 5, minLevel: 'warn' })).map((e) => e.msg)
    ).toEqual(['m2', 'm3'])
    expect(
      (await readLogTail(file, { limit: 10, keep: 5, scopes: ['llm'] })).map((e) => e.msg)
    ).toEqual(['m2', 'm4'])
    expect(
      (await readLogTail(file, { limit: 10, keep: 5, jobId: 'j1' })).map((e) => e.msg)
    ).toEqual(['m2', 'm4'])
  })

  it('a job older than the last 1000 lines is returned whole from the archives', async () => {
    const old = Array.from({ length: 30 }, (_, i) => entry(i, { jobId: 'old', msg: `old${i}` }))
    writeFileSync(join(dir, 'main.2.log'), lines(old))
    writeFileSync(join(dir, 'main.1.log'), lines(Array.from({ length: 800 }, (_, i) => entry(i))))
    writeFileSync(file, lines(Array.from({ length: 800 }, (_, i) => entry(i, { jobId: 'new' }))))
    expect(await readLogTail(file, { limit: 1000, keep: 5 })).not.toContainEqual(
      expect.objectContaining({ jobId: 'old' })
    )
    const out = await readLogTail(file, { limit: 2000, keep: 5, jobId: 'old' })
    expect(out.map((e) => e.msg)).toEqual(old.map((e) => e.msg))
  })

  it('no log file yet: empty', async () => {
    expect(await readLogTail(file, { limit: 10, keep: 5 })).toEqual([])
  })
})

describe('readLogsForExport', () => {
  it('oldest file first, home folder as ~, secrets redacted again', async () => {
    writeFileSync(join(dir, 'main.1.log'), 'old /home/ana/Videos/a.mkv\n')
    writeFileSync(file, 'new sk-or-v1-abcdefghijklmnop at /home/ana/x\n')
    const text = await readLogsForExport(file, {
      keep: 5,
      home: '/home/ana',
      redactor: new Redactor()
    })
    expect(text).toBe('old ~/Videos/a.mkv\nnew sk-or-*** at ~/x\n')
  })

  it('Windows home paths too (case-insensitive, both slash styles)', async () => {
    writeFileSync(file, 'C:\\Users\\Ana\\Videos and c:/users/ana/x\n')
    const text = await readLogsForExport(file, {
      keep: 5,
      home: 'C:\\Users\\Ana',
      redactor: new Redactor()
    })
    expect(text).toBe('~\\Videos and ~/x\n')
  })
})
