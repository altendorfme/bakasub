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
  | 'INVALID_PATH'
  | 'DISK_FULL'
  | 'PRESET_NOT_FOUND'
  | 'PRESET_IN_USE'
  | 'PRESET_NAME_TAKEN'
  | 'PRESET_READ_ONLY'
  | 'MODEL_NOT_SET'
  | 'INVALID_PRESET_FILE'
  | 'INVALID_INPUT'
  | 'JOB_NOT_FOUND'
  | 'JOB_INVALID_STATE'
  | 'BATCH_NOT_FOUND'
  | 'MEDIA_TOOL_FAILED'
  | 'INVALID_SUBTITLE'

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
