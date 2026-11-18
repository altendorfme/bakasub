import type { AppliedFix } from './diagnostics'
import type { DocumentMeta, FormatId, Node, SubtitleDocument } from './types'

/** Tokeniza o texto de um cue em Text/Tag/LineBreak segundo as regras do formato. */
export type InlineLexer = (text: string) => Node[]

export interface RepairOptions {
  /** O que fazer com blocos não parseados: manter verbatim (padrão) ou descartar. */
  unparsed?: 'keep' | 'drop'
}

export interface RepairResult {
  text: string
  applied: AppliedFix[]
}

/** Contrato de um formato: o parser só desmonta e monta texto. */
export interface SubtitleFormat<F = unknown> {
  readonly id: FormatId
  /** Usado pela segmentação para detectar tags inventadas pelo LLM sem conhecer o formato. */
  readonly lexInline: InlineLexer
  /** Nunca lança por conteúdo; só `SubtitleParseError` para entrada vazia/sem cues válidos. */
  /** `meta` vem do `decodeSubtitle`; se omitido, é derivado do próprio texto (UTF-8, sem BOM). */
  parse(text: string, meta?: DocumentMeta): SubtitleDocument<F>
  /** Exato: `serialize(parse(s)) === s`. */
  serialize(doc: SubtitleDocument<F>): string
  /** Aplica apenas correções `fix: 'auto'` e devolve o que foi alterado. */
  serializeRepaired(doc: SubtitleDocument<F>, options?: RepairOptions): RepairResult
}

export class SubtitleParseError extends Error {
  constructor(
    readonly code: 'EMPTY_INPUT' | 'NO_VALID_CUES',
    message: string
  ) {
    super(message)
    this.name = 'SubtitleParseError'
  }
}
