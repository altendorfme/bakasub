import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from '@shared/error-codes'
import { IpcCallError } from '@renderer/lib/ipc'
import { i18n } from '.'
import { errorMessage } from './error-message'

describe('errorMessage', () => {
  it('every error code the Main can send has an English message', () => {
    for (const code of ERROR_CODES) {
      const text = i18n.t(`errors:${code}`)
      expect(text, code).not.toBe(code)
      expect(text, code).not.toContain('errors:')
      expect(text.length, code).toBeGreaterThan(0)
    }
  })

  it('translates a known code, never the raw Main message', () => {
    const msg = errorMessage(new IpcCallError('LLM_CREDITS', 'POST /chat -> 402'))
    expect(msg).toBe(i18n.t('errors:LLM_CREDITS'))
    expect(msg).not.toContain('402')
  })

  it('unknown code: generic message that still names the code', () => {
    expect(errorMessage(new IpcCallError('SOMETHING_NEW', 'x'))).toBe(
      i18n.t('errors:unknown', { code: 'SOMETHING_NEW' })
    )
  })

  it('non-IPC errors become the generic message', () => {
    expect(errorMessage(new Error('boom'))).toBe(i18n.t('errors:unknown', { code: 'UNEXPECTED' }))
    expect(errorMessage('weird')).toBe(i18n.t('errors:unknown', { code: 'UNEXPECTED' }))
  })
})
