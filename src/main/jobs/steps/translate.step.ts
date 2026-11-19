import { join } from 'node:path'
import { TranslationCancelled } from '../../llm/translate-document'
import { fileArtifact } from '../artifacts'
import type { Step } from '../step-context'
import { writeSubtitle } from './subtitle-io'
import { translationInput } from './translation-input'

/** Lê a legenda (origem ou faixa extraída), traduz e grava o resultado no diretório de trabalho. */
export const translateStep: Step = async (ctx) => {
  const input = await translationInput(ctx)
  const { doc, format, formatId: id } = input
  let result
  try {
    result = await ctx.deps.translator.translate(
      {
        doc,
        format,
        profile: input.profile,
        targetLang: input.targetLang,
        sourceLang: input.sourceLang
      },
      {
        signal: ctx.signal,
        onProgress: (p) =>
          ctx.progress({
            stepFraction: p.total ? p.done / p.total : undefined,
            translation: { done: p.done, total: p.total, cached: p.cached, chunk: p.chunk },
            cost: p.cost
          })
      }
    )
  } catch (err) {
    if (err instanceof TranslationCancelled) ctx.recordUsage(err.usage)
    throw err
  }
  ctx.recordUsage(result.usage)

  const out = join(ctx.workDir, `translated.${id}`)
  const fixes = await writeSubtitle(out, result.doc, format)
  if (fixes.length) ctx.warn(`auto-fixed: ${[...new Set(fixes)].join(', ')}`)
  ctx.artifacts.translate = {
    file: { ...(await fileArtifact(out)), format: id },
    failedLines: result.failed.map((f) => ({ cueId: f.cueId, reason: f.reason })),
    usage: result.usage,
    cache: result.cache
  }
}
