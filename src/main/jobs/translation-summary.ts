import type { JobTranslationSummary } from '../../shared/ipc-contract'

interface FrozenTranslation {
  kind?: string
  preset?: { id?: unknown; name?: unknown; model?: unknown } | null
  targetLang?: unknown
  sourceLang?: unknown
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/**
 * What the job detail shows about how a translation was set up: model, preset and languages, as
 * FROZEN in the spec at creation (editing or deleting the preset later changes nothing here).
 * Every field is optional: specs persisted before a field existed (or malformed ones) simply omit
 * it, and the UI says "not recorded". `undefined` for kinds that do not translate.
 */
export function translationSummary(spec: unknown): JobTranslationSummary | undefined {
  const s = spec as FrozenTranslation | null
  if (s?.kind !== 'translate' && s?.kind !== 'pipeline') return undefined
  const p = s.preset && typeof s.preset === 'object' ? s.preset : undefined
  const model = str(p?.model)
  const presetId = str(p?.id)
  const presetName = str(p?.name)
  const targetLang = str(s.targetLang)
  const sourceLang = str(s.sourceLang)
  return {
    ...(model ? { model } : {}),
    ...(presetId && presetName ? { preset: { id: presetId, name: presetName } } : {}),
    ...(targetLang ? { targetLang } : {}),
    ...(sourceLang ? { sourceLang } : {})
  }
}
