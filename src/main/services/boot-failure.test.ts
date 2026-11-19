import { describe, expect, it } from 'vitest'
import { DatabaseSchemaMismatchError } from '../database/init'
import { bootFailureMessage } from './boot-failure'

const db = '/home/ana/.config/bakasub/bakasub.db'

describe('bootFailureMessage', () => {
  it('development + migration mismatch: tells exactly which files to delete', () => {
    const m = bootFailureMessage(
      new DatabaseSchemaMismatchError('migration 1 is not in this build'),
      {
        packaged: false,
        dbPath: db,
        logPath: '/logs/main.log'
      }
    )
    expect(m.title).toBe('BakaSub could not start')
    expect(m.body).toContain(`${db}*`)
    expect(m.body).toContain('migration 0000 was regenerated')
  })

  it('packaged + mismatch: no dev advice; points to the logs', () => {
    const m = bootFailureMessage(new DatabaseSchemaMismatchError('x'), {
      packaged: true,
      dbPath: db,
      logPath: '/logs/main.log'
    })
    expect(m.body).not.toContain('0000')
    expect(m.body).toContain('newer version of BakaSub')
    expect(m.body).toContain('/logs/main.log')
  })

  it('anything else: the error message and the log path', () => {
    const m = bootFailureMessage(new Error('EACCES: permission denied'), {
      packaged: true,
      dbPath: db,
      logPath: '/logs/main.log'
    })
    expect(m.body).toContain('EACCES: permission denied')
    expect(m.body).toContain('/logs/main.log')
  })
})
