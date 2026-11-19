import type { ErrorCode } from '@shared/error-codes'

/** One message per error code. The type makes a missing code a compile error. */
const codes = {
  NETWORK: 'Could not reach the server. Check your internet connection and try again.',
  INVALID_MANIFEST: 'The download list for the tools is invalid. Try again later.',
  CHECKSUM_MISMATCH: 'The downloaded file did not pass the integrity check and was discarded.',
  EXTRACT_FAILED: 'The downloaded tool could not be unpacked.',
  PROBE_FAILED: 'The installed tool did not start. Reinstall it from Settings.',
  PROCESS_TIMEOUT: 'An external tool took too long and was stopped.',
  UNSUPPORTED_PLATFORM: 'This tool is not available for your system.',
  SIDECAR_BUSY: 'The tools are already being installed.',
  SIDECAR_MISSING: 'mkvtoolnix is not installed. Install it to work with video files.',
  UNKNOWN_TOOL: 'Unknown tool.',
  CANCELLED: 'Cancelled.',
  MEMORY_BUSY: 'The translation cache is busy. Try again when the running jobs finish.',
  LLM_AUTH: 'OpenRouter rejected the API key. Check it in Settings.',
  LLM_CREDITS: 'Your OpenRouter credits ran out. Add credits and retry the job.',
  LLM_BAD_REQUEST: 'The model rejected the request. Try another model.',
  LLM_UNAVAILABLE: 'The model is unavailable right now. Retry later or pick another model.',
  LLM_UNKNOWN_MODEL: 'This model is no longer available on OpenRouter. Pick another one.',
  LLM_TOO_MANY_FAILURES: 'Too many lines failed to translate. Try another model or preset.',
  INVALID_PATH: 'This file or folder cannot be used. Choose it again.',
  DISK_FULL: 'Not enough free disk space for the output.',
  PRESET_NOT_FOUND: 'This preset no longer exists.',
  PRESET_IN_USE: 'This preset is used by a queued or running job.',
  PRESET_NAME_TAKEN: 'A preset with this name already exists.',
  PRESET_READ_ONLY: 'Built-in presets cannot be changed. Duplicate it to edit a copy.',
  MODEL_NOT_SET: 'Choose a model first: star one in Models and make it the default.',
  INVALID_PRESET_FILE: 'This is not a valid BakaSub presets file.',
  INVALID_INPUT: 'Some of the information sent was invalid.',
  JOB_NOT_FOUND: 'This job no longer exists.',
  JOB_INVALID_STATE: 'This action is not available for the job right now.',
  BATCH_NOT_FOUND: 'This batch no longer exists.',
  MEDIA_TOOL_FAILED: 'mkvtoolnix could not process this file.',
  INVALID_SUBTITLE: 'This subtitle file could not be read.',
  SETTINGS_CONFLICT:
    'The default model and language must stay in your lists. Pick another default before removing it.',
  TARGET_LANG_NOT_SET:
    'Choose a target language first: add one in Languages and make it the default.',
  FORBIDDEN: 'The request was blocked.',
  INTERNAL: 'Something went wrong inside BakaSub. Details are in the logs.'
} satisfies Record<ErrorCode, string>

export const errors = {
  ...codes,
  unknown: 'Something went wrong ({{code}}). Details are in the logs.'
}
