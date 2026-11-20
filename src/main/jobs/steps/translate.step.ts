import { join } from 'node:path'
import type { FailedLine } from '../../../shared/ipc-contract'
import type { LineFailure } from '../../llm/chunk-translator'
import { TranslationCancelled } from '../../llm/translate-document'
import { analyzeCoverage, type SubtitleDocument } from '../../parsers'
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
        preset: input.preset,
        media: input.media,
        targetLang: input.targetLang,
        sourceLang: input.sourceLang
      },
      {
        signal: ctx.signal,
        onProgress: (p) =>
          ctx.progress({
            stepFraction: p.total ? p.done / p.total : undefined,
            translation: {
              done: p.done,
              total: p.total,
              cached: p.cached,
              ...(p.chunk ? { chunk: p.chunk } : {}),
              ...(p.timeline ? { timeline: p.timeline } : {})
            },
            cost: p.cost,
            ...(p.waiting ? { waiting: p.waiting } : {})
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
    failedLines: describeFailures(doc, result.failed),
    usage: result.usage,
    cache: result.cache
  }
}

/** Falhas com o trecho e o tempo da fala de origem, para a UI mostrar o que ficou sem tradução. */
export function describeFailures(
  doc: SubtitleDocument<unknown>,
  failed: readonly LineFailure[]
): FailedLine[] {
  if (!failed.length) return []
  const entries = new Map(
    analyzeCoverage(doc, { failures: failed, maxEntries: doc.items.length }).entries.flatMap((e) =>
      e.ref.kind === 'cue' ? [[e.ref.cueId, e] as const] : []
    )
  )
  return failed.map((f) => {
    const e = entries.get(f.cueId)
    return {
      cueId: f.cueId,
      reason: f.reason,
      ...(e ? { excerpt: e.excerpt, location: { ...e.location } } : {})
    }
  })
}
