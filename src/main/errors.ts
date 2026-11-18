export type AppErrorCode =
  | 'NETWORK'
  | 'INVALID_MANIFEST'
  | 'CHECKSUM_MISMATCH'
  | 'EXTRACT_FAILED'
  | 'PROBE_FAILED'
  | 'PROCESS_TIMEOUT'
  | 'UNSUPPORTED_PLATFORM'
  | 'SIDECAR_BUSY'
  | 'SIDECAR_MISSING'
  | 'UNKNOWN_TOOL'
  | 'CANCELLED'

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
