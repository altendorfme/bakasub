import { ERROR_CODES, type ErrorCode } from '@shared/error-codes'
import { IpcCallError } from '@renderer/lib/ipc'
import { i18n } from '.'

const KNOWN = new Set<string>(ERROR_CODES)
const isKnown = (code: string): code is ErrorCode => KNOWN.has(code)

/**
 * User-facing text for any thrown value. Always by code: the Main's `message` is for logs and
 * may carry paths or HTTP details.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof IpcCallError && isKnown(err.code)) return i18n.t(`errors:${err.code}`)
  const code = err instanceof IpcCallError ? err.code : 'UNEXPECTED'
  return i18n.t('errors:unknown', { code })
}
