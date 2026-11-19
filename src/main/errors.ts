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
  | 'MEMORY_BUSY'
  | 'LLM_AUTH'
  | 'LLM_CREDITS'
  | 'LLM_BAD_REQUEST'
  | 'LLM_UNAVAILABLE'
  | 'LLM_UNKNOWN_MODEL'
  | 'LLM_TOO_MANY_FAILURES'

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
