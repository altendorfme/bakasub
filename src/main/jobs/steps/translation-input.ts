import { AppError } from '../../errors'
import type { SubtitleDocument, SubtitleFormat } from '../../parsers'
import type { ProfileSnapshot } from '../job-spec'
import type { StepContext } from '../step-context'
import { formatFromPath, readSubtitle, type TextFormatId } from './subtitle-io'

export interface TranslationInput {
  readonly doc: SubtitleDocument<unknown>
  readonly format: SubtitleFormat<unknown>
  readonly formatId: TextFormatId
  readonly profile: ProfileSnapshot
  readonly targetLang: string
  readonly sourceLang?: string
}

/**
 * O documento a traduzir: o arquivo de origem (`translate`) ou a faixa extraída (`pipeline`).
 * Compartilhado por `preflight` e `translate`, para a estimativa valer exatamente para o que
 * será enviado.
 */
export async function translationInput(ctx: StepContext): Promise<TranslationInput> {
  const { spec } = ctx
  if (spec.kind !== 'translate' && spec.kind !== 'pipeline')
    throw new AppError('INVALID_INPUT', `translation step in a ${spec.kind} job`)
  let path: string
  let formatId: TextFormatId
  let sourceLang = spec.sourceLang
  if (spec.kind === 'translate') {
    path = spec.source
    formatId = formatFromPath(spec.source)
  } else {
    const f = ctx.artifacts.extract?.files.find((x) => x.trackId === spec.trackId)
    if (!f) throw new AppError('INVALID_INPUT', 'Extracted track is missing')
    path = f.path
    formatId = f.format
    sourceLang ??= f.language
  }
  const { doc, format } = await readSubtitle(path, formatId)
  return {
    doc,
    format,
    formatId,
    profile: spec.profile,
    targetLang: spec.targetLang,
    ...(sourceLang ? { sourceLang } : {})
  }
}
