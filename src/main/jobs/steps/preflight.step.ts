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
      preset: input.preset,
      media: input.media,
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
  // Cota free insuficiente: custo zero não pode confirmar sozinho (o usuário precisa ver o aviso).
  const shortQuota = estimate.freeQuota?.enough === false
  if (shortQuota)
    ctx.warn(
      `free-model daily quota: ~${estimate.freeQuota!.requests} requests needed, ` +
        `${estimate.freeQuota!.remaining} left today`
    )
  ctx.artifacts.preflight = {
    estimate: {
      ...estimate,
      decision:
        // Tudo em cache também para: a revisão mostra a cobertura e que nada vai ao LLM.
        !confirm || (cheap && !shortQuota) ? 'auto-confirmed' : 'needs-confirmation'
    },
    coverage
  }
}
