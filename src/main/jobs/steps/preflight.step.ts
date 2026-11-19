import type { Step } from '../step-context'
import { translationInput } from './translation-input'

/**
 * Estima tokens/custo antes de qualquer chamada ao LLM e decide se o job precisa de
 * confirmação. A decisão fica no artefato; o runner pausa antes de `translate`.
 */
export const preflightStep: Step = async (ctx) => {
  const input = await translationInput(ctx)
  const { estimate, coverage } = await ctx.deps.preflight.run(
    {
      doc: input.doc,
      format: input.format,
      profile: input.profile,
      targetLang: input.targetLang,
      sourceLang: input.sourceLang
    },
    ctx.signal
  )
  const confirm =
    ctx.spec.kind === 'translate' || ctx.spec.kind === 'pipeline'
      ? ctx.spec.confirmBeforeTranslate
      : false
  const threshold = await ctx.deps.preflight.autoConfirmBelowUsd()
  const cheap = threshold !== null && estimate.cost !== null && estimate.cost.high < threshold
  // Nada a traduzir (tudo em cache) não tem custo: não faz sentido pedir confirmação.
  const nothing = estimate.lines.toTranslate === 0
  ctx.artifacts.preflight = {
    estimate: {
      ...estimate,
      decision: !confirm || cheap || nothing ? 'auto-confirmed' : 'needs-confirmation'
    },
    coverage
  }
}
