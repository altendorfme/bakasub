// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { installGlobalErrorReporting, reportError } from './report-error'

afterEach(() => vi.restoreAllMocks())

describe('renderer error reporting', () => {
  it('uncaught errors and unhandled rejections go to logs:report', () => {
    const report = vi.fn(() => ok({ accepted: true }))
    installFakeApi({ logs: { report } })
    const uninstall = installGlobalErrorReporting()
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: new Error('boom') }))
    const rejection = new Event('unhandledrejection') as Event & { reason: unknown }
    rejection.reason = 'nope'
    window.dispatchEvent(rejection)
    uninstall()
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', message: 'boom', source: 'window' })
    )
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', message: 'nope', source: 'promise' })
    )
  })

  it('a failing report never throws back into the app', async () => {
    installFakeApi({ logs: { report: () => Promise.reject(new Error('ipc down')) } })
    await expect(reportError(new Error('x'), 'boundary')).resolves.toBeUndefined()
  })
})
