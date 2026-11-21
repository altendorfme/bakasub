import type { PublicSettings, SubtitleInspection } from '@shared/ipc-contract'

/** Settings of a user who finished the onboarding (the shell opens without redirecting). */
export const onboardedSettings: PublicSettings = {
  'translation.defaultModel': 'a/b',
  'translation.defaultTargetLang': 'pt-BR',
  'translation.defaultPresetId': 'builtin:series',
  'translation.targetLangs': ['pt-BR'],
  'models.favorites': ['a/b'],
  'jobs.concurrency': 2,
  'preflight.autoConfirmBelowUsd': null,
  'tracks.preferredSourceLangs': ['en'],
  'logs.level': 'info',
  'updates.autoCheck': true,
  'notifications.enabled': true,
  'notifications.job': true,
  'notifications.batch': true,
  'notifications.update': true,
  'ui.language': 'en',
  'output.mode': 'mux',
  'output.extractNaming': 'player',
  'llm.rateLimit.freeRpm': 20,
  'llm.rateLimit.paidRpm': null,
  'llm.rateLimit.freeTier': 'auto',
  'llm.retry.maxThrottled': 5,
  'llm.retry.maxTransient': 3,
  'llm.retry.baseDelayMs': 1000,
  'llm.retry.maxDelayMs': 30000,
  'llm.retry.chunkRounds': 2,
  'llm.concurrency.perJob': 4,
  'llm.concurrency.paidMaxInFlight': 8,
  'llm.concurrency.freeMaxInFlight': 3
}

/** `files:inspect` result for a clean UTF-8 SRT; override fields per test. */
export function subtitleInspection(over: Partial<SubtitleInspection> = {}): SubtitleInspection {
  return {
    file: { name: 'episode.srt', sizeBytes: 1024 },
    format: 'srt',
    encoding: { name: 'utf-8', confidence: 'certain', score: null, bom: false, eol: 'lf' },
    diagnostics: { items: [], totals: { info: 0, warn: 0, error: 0 }, truncated: false },
    coverage: {
      totals: { cues: 2, blocks: 0, translatable: 2, skipped: 0, untranslated: 0 },
      byReason: {},
      entries: [],
      truncated: false
    },
    ...over
  }
}
