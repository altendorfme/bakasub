import { describe, expect, it } from 'vitest'
import { parseLogLine, serializeEntry, toLogEntry } from './log-entry'

const date = new Date('2026-11-19T10:00:00.000Z')

describe('toLogEntry', () => {
  it('first string is the message; job id from the context', () => {
    expect(
      toLogEntry({ date, level: 'warn', scope: 'llm', data: ['retrying'], jobId: 'j1' })
    ).toEqual({
      time: '2026-11-19T10:00:00.000Z',
      level: 'warn',
      scope: 'llm',
      msg: 'retrying',
      jobId: 'j1'
    })
  })

  it('extra arguments become the detail; an Error keeps code and stack', () => {
    const err = Object.assign(new Error('boom'), { code: 'LLM_CREDITS' })
    const e = toLogEntry({ date, level: 'error', scope: 'jobs', data: ['job failed', err] })
    expect(e.msg).toBe('job failed')
    expect(e.detail).toContain('LLM_CREDITS')
    expect(e.detail).toContain('boom')
    const o = toLogEntry({ date, level: 'info', scope: 'app', data: ['x', { a: 1 }, 'y'] })
    expect(o.detail).toBe('{"a":1}\ny')
  })

  it('an Error as the only argument; missing scope or unknown level are normalized', () => {
    const e = toLogEntry({ date, level: 'silly', data: [new Error('uncaught')] })
    expect(e).toMatchObject({ level: 'debug', scope: 'app', msg: 'uncaught' })
    expect(e.detail).toContain('Error: uncaught')
  })

  it('caps very long detail', () => {
    const e = toLogEntry({ date, level: 'info', scope: 'app', data: ['x', 'y'.repeat(50_000)] })
    expect(e.detail!.length).toBeLessThanOrEqual(16_100)
    expect(e.detail).toMatch(/…\(truncated\)$/)
  })
})

describe('serializeEntry / parseLogLine', () => {
  it('round-trips one JSON object per line', () => {
    const e = toLogEntry({ date, level: 'info', scope: 'db', data: ['ready\nnow'], jobId: 'j2' })
    const line = serializeEntry(e)
    expect(line).not.toContain('\n')
    expect(parseLogLine(line)).toEqual(e)
  })

  it('reads lines written before the JSON format (plain electron-log text)', () => {
    expect(parseLogLine('[2026-11-18 09:00:01.123] [warn] (ipc) jobs:list took 400 ms')).toEqual({
      time: '2026-11-18 09:00:01.123',
      level: 'warn',
      scope: 'ipc',
      msg: 'jobs:list took 400 ms'
    })
    expect(parseLogLine('something odd')).toEqual({
      time: '',
      level: 'info',
      scope: 'app',
      msg: 'something odd'
    })
  })

  it('blank lines are skipped', () => {
    expect(parseLogLine('   ')).toBeNull()
  })
})
