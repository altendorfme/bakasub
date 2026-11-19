/** API pública dos parsers. Tudo aqui é puro (sem `electron`) e roda em Node simples. */
export { decodeSubtitle, metaFromText, type DecodedSubtitle } from './decode/subtitle-decoder'
export { srtFormat, type SrtCueData } from './srt'
export { assFormat, ssaFormat, type AssCueData } from './ass'
export { SubtitleParseError } from './core/format'
export type { InlineLexer, RepairOptions, RepairResult, SubtitleFormat } from './core/format'
export { cuePlainText } from './core/plain-text'
export { FIX_POLICY } from './core/diagnostics'
export type { AppliedFix, Diagnostic, DiagnosticCode } from './core/diagnostics'
export {
  classify,
  toTranslationUnit,
  type Classification,
  type TranslationUnit
} from './core/segmentation/segmenter'
export {
  applyTranslation,
  validateTranslation,
  type ApplyResult
} from './core/segmentation/reinject'
export type { Issue, IssueCode } from './core/segmentation/validator'
export {
  analyzeCoverage,
  type CoverageEntry,
  type CoverageReport,
  type CoverageReason
} from './core/coverage'
export type { Cue, Item, Node, SubtitleDocument, UnparsedBlock } from './core/types'
