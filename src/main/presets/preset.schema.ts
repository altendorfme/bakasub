import { z } from 'zod'
import type { PresetInput } from '../../shared/ipc-contract'

export const MAX_PRESET_PROMPT = 4000
export const MAX_USER_NOTES = 4000

/** Entrada da termbase: `source` + ao menos `target` ou `rule`. */
export const GlossaryEntrySchema = z
  .object({
    source: z.string().trim().min(1).max(200),
    target: z.string().trim().min(1).max(200).optional(),
    rule: z.string().trim().min(1).max(500).optional()
  })
  .refine((e) => e.target !== undefined || e.rule !== undefined, {
    message: 'glossary entry needs a target or a rule'
  })

export const LangTagSchema = z.string().transform((tag, ctx) => {
  try {
    const [canonical] = Intl.getCanonicalLocales(tag)
    if (canonical) return canonical
  } catch {
    // cai no issue abaixo
  }
  ctx.addIssue({ code: 'custom', message: 'invalid BCP-47 language tag' })
  return z.NEVER
})

/** Rótulo livre, só informativo. */
export const MediaTypeSchema = z.string().trim().min(1).max(40)

export const PresetInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  mediaType: MediaTypeSchema,
  temperature: z.number().min(0).max(2),
  prompt: z.string().trim().max(MAX_PRESET_PROMPT),
  glossary: z.array(GlossaryEntrySchema).max(500)
}) satisfies z.ZodType<PresetInput>

export type PresetData = z.output<typeof PresetInputSchema>
