import type { TranslationKey } from '../i18n'
import type { IconName } from './icons'

/** Same item shape for every icon + title + body list on the page. */
export interface ContentItem {
  id: string
  icon: IconName
  title: TranslationKey
  body: TranslationKey
}

/** The seven points of the README "What it does" list, in reading order. */
export const features = [
  { id: 'cost', icon: 'receipt', title: 'features.cost.title', body: 'features.cost.body' },
  { id: 'memory', icon: 'database', title: 'features.memory.title', body: 'features.memory.body' },
  { id: 'tmdb', icon: 'film', title: 'features.tmdb.title', body: 'features.tmdb.body' },
  { id: 'presets', icon: 'book', title: 'features.presets.title', body: 'features.presets.body' },
  { id: 'batch', icon: 'layers', title: 'features.batch.title', body: 'features.batch.body' },
  { id: 'tags', icon: 'braces', title: 'features.tags.title', body: 'features.tags.body' },
  { id: 'privacy', icon: 'shield', title: 'features.privacy.title', body: 'features.privacy.body' }
] as const satisfies readonly ContentItem[]

export const pipelineSteps = [
  { id: 'extract', icon: 'extract', title: 'pipeline.extract.title', body: 'pipeline.extract.body' },
  { id: 'translate', icon: 'translate', title: 'pipeline.translate.title', body: 'pipeline.translate.body' },
  { id: 'remux', icon: 'remux', title: 'pipeline.remux.title', body: 'pipeline.remux.body' }
] as const satisfies readonly ContentItem[]

export const privacyPoints = [
  { id: 'account', icon: 'user', title: 'privacy.account.title', body: 'privacy.account.body' },
  { id: 'telemetry', icon: 'signal', title: 'privacy.telemetry.title', body: 'privacy.telemetry.body' },
  { id: 'local', icon: 'key', title: 'privacy.local.title', body: 'privacy.local.body' }
] as const satisfies readonly ContentItem[]

export const privacySent = ['privacy.sent.openrouter', 'privacy.sent.tmdb', 'privacy.sent.none'] as const satisfies readonly TranslationKey[]
