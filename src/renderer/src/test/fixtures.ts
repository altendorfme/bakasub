import type { PublicSettings } from '@shared/ipc-contract'

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
  'ui.language': 'en',
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
