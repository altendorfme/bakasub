import { z } from 'zod'

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

const LangTag = z.string().transform((tag, ctx) => {
  try {
    const [canonical] = Intl.getCanonicalLocales(tag)
    if (canonical) return canonical
  } catch {
    // cai no issue abaixo
  }
  ctx.addIssue({ code: 'custom', message: 'invalid BCP-47 language tag' })
  return z.NEVER
})

export const ProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(200),
  glossary: z.array(GlossaryEntrySchema).max(500),
  targetLang: LangTag,
  temperature: z.number().min(0).max(2)
})

export type ProfileInput = z.input<typeof ProfileInputSchema>
export type ProfileData = z.output<typeof ProfileInputSchema>
