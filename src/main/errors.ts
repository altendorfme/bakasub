import type { AppErrorCode } from '../shared/error-codes'

export type { AppErrorCode }

/** Erro de domínio com código estável, propagado pelo IPC como `{ code, message }`. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'AppError'
  }
}
