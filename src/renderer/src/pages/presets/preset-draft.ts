import type { GlossaryEntry, Preset, PresetInput } from '@shared/ipc-contract'

/** Same limits as the Main's `PresetInputSchema` (it validates again). */
export const PRESET_LIMITS = {
  name: 80,
  mediaType: 40,
  prompt: 4000,
  source: 200,
  target: 200,
  rule: 500,
  glossary: 500
} as const

/** Suggested media types; the field is free text. */
export const MEDIA_TYPE_SUGGESTIONS = ['movie', 'series', 'anime', 'documentary'] as const

/** Editable form: text everywhere (the temperature too), converted on save. */
export interface PresetDraft {
  name: string
  mediaType: string
  temperature: string
  prompt: string
  glossary: { source: string; target: string; rule: string }[]
}

export const emptyDraft: PresetDraft = {
  name: '',
  mediaType: 'series',
  temperature: '0.45',
  prompt: '',
  glossary: []
}

export const draftOf = (p: Preset): PresetDraft => ({
  name: p.name,
  mediaType: p.mediaType,
  temperature: String(p.temperature),
  prompt: p.prompt,
  glossary: p.glossary.map((g) => ({
    source: g.source,
    target: g.target ?? '',
    rule: g.rule ?? ''
  }))
})

export type FieldError = 'required' | 'tooLong' | 'range'

export type DraftErrors = Partial<
  Record<'name' | 'mediaType' | 'temperature' | 'prompt', FieldError>
> & {
  glossary?: Record<number, 'source' | 'targetOrRule' | 'tooLong'>
  glossaryCount?: true
}

/** Error codes the form maps to messages; empty object = valid. */
export function validateDraft(d: PresetDraft): DraftErrors {
  const e: DraftErrors = {}
  const name = d.name.trim()
  if (!name) e.name = 'required'
  else if (name.length > PRESET_LIMITS.name) e.name = 'tooLong'
  const type = d.mediaType.trim()
  if (!type) e.mediaType = 'required'
  else if (type.length > PRESET_LIMITS.mediaType) e.mediaType = 'tooLong'
  const temp = Number(d.temperature)
  if (d.temperature.trim() === '' || !Number.isFinite(temp) || temp < 0 || temp > 2)
    e.temperature = 'range'
  if (d.prompt.trim().length > PRESET_LIMITS.prompt) e.prompt = 'tooLong'
  if (d.glossary.length > PRESET_LIMITS.glossary) e.glossaryCount = true
  d.glossary.forEach((g, i) => {
    const issue = !g.source.trim()
      ? 'source'
      : !g.target.trim() && !g.rule.trim()
        ? 'targetOrRule'
        : g.source.trim().length > PRESET_LIMITS.source ||
            g.target.trim().length > PRESET_LIMITS.target ||
            g.rule.trim().length > PRESET_LIMITS.rule
          ? 'tooLong'
          : null
    if (issue) (e.glossary ??= {})[i] = issue
  })
  return e
}

export const isValid = (e: DraftErrors): boolean => Object.keys(e).length === 0

export function toInput(d: PresetDraft): PresetInput {
  return {
    name: d.name.trim(),
    mediaType: d.mediaType.trim(),
    temperature: Number(d.temperature),
    prompt: d.prompt.trim(),
    glossary: d.glossary.map((g): GlossaryEntry => {
      const target = g.target.trim()
      const rule = g.rule.trim()
      return { source: g.source.trim(), ...(target ? { target } : {}), ...(rule ? { rule } : {}) }
    })
  }
}
