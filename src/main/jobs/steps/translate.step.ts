import { join } from 'node:path'
import { AppError } from '../../errors'
import { TranslationCancelled } from '../../llm/translate-document'
import { fileArtifact } from '../artifacts'
import type { Step } from '../step-context'
import { formatFromPath, readSubtitle, writeSubtitle, type TextFormatId } from './subtitle-io'

/** Lê a legenda (origem ou faixa extraída), traduz e grava o resultado no diretório de trabalho. */
export const translateStep: Step = async (ctx) => {
  const { spec } = ctx
  if (spec.kind !== 'translate' && spec.kind !== 'pipeline')
    throw new AppError('INVALID_INPUT', `translate step in a ${spec.kind} job`)

  let input: string
  let id: TextFormatId
  let sourceLang = spec.sourceLang
  if (spec.kind === 'translate') {
    input = spec.source
    id = formatFromPath(spec.source)
  } else {
    const f = ctx.artifacts.extract?.files.find((x) => x.trackId === spec.trackId)
    if (!f) throw new AppError('INVALID_INPUT', 'Extracted track is missing')
    input = f.path
    id = f.format
    sourceLang ??= f.language
  }

  const { doc, format } = await readSubtitle(input, id)
  let result
  try {
    result = await ctx.deps.translator.translate(
      { doc, format, profile: spec.profile, targetLang: spec.targetLang, sourceLang },
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
