export type DiagnosticSeverity = 'info' | 'warn' | 'error'

/**
 * `auto`: o serializer reparado corrige de forma determinística e segura.
 * `report`: só informa; corrigir exigiria decisão do usuário ou alteraria conteúdo.
 */
export type FixPolicy = 'auto' | 'report'

export type DiagnosticCode =
  // SRT: corrigíveis
  | 'SRT_INDEX_MISSING'
  | 'SRT_INDEX_DUPLICATE'
  | 'SRT_INDEX_GAP'
  | 'SRT_TIME_DOT_SEPARATOR'
  | 'SRT_TIME_PADDING'
  | 'SRT_ARROW_SPACING'
  | 'SRT_MISSING_BLANK_LINE'
  | 'SRT_EOL_MIXED'
  | 'SRT_TRAILING_WS'
  // SRT: somente relato
  | 'SRT_END_BEFORE_START'
  | 'SRT_OVERLAP'
  | 'SRT_EMPTY_CUE'
  | 'SRT_TIMING_EXTRAS'
  | 'SRT_UNPARSEABLE_BLOCK'
  | 'SRT_AMBIGUOUS_INDEX'
  // ASS/SSA
  | 'ASS_EOL_MIXED'
  | 'ASS_TIME_FORMAT'
  | 'ASS_END_BEFORE_START'
  | 'ASS_FORMAT_MISSING'
  | 'ASS_UNPARSEABLE_EVENT'
  // WebVTT: corrigíveis
  | 'VTT_HEADER_MISSING'
  | 'VTT_TIME_FORMAT'
  | 'VTT_MISSING_BLANK_LINE'
  | 'VTT_ARROW_IN_TEXT'
  | 'VTT_EOL_MIXED'
  // WebVTT: somente relato
  | 'VTT_END_BEFORE_START'
  | 'VTT_EMPTY_CUE'
  | 'VTT_UNPARSEABLE_BLOCK'
  // Segmentação
  | 'SEG_MARKER_COLLISION'

/** Quais códigos o serializer reparado sabe corrigir. Fonte única para parser, serializer e docs. */
export const FIX_POLICY: Readonly<Record<DiagnosticCode, FixPolicy>> = {
  SRT_INDEX_MISSING: 'auto',
  SRT_INDEX_DUPLICATE: 'auto',
  SRT_INDEX_GAP: 'auto',
  SRT_TIME_DOT_SEPARATOR: 'auto',
  SRT_TIME_PADDING: 'auto',
  SRT_ARROW_SPACING: 'auto',
  SRT_MISSING_BLANK_LINE: 'auto',
  SRT_EOL_MIXED: 'auto',
  SRT_TRAILING_WS: 'auto',
  SRT_END_BEFORE_START: 'report',
  SRT_OVERLAP: 'report',
  SRT_EMPTY_CUE: 'report',
  SRT_TIMING_EXTRAS: 'report',
  SRT_UNPARSEABLE_BLOCK: 'report',
  SRT_AMBIGUOUS_INDEX: 'report',
  ASS_EOL_MIXED: 'auto',
  ASS_TIME_FORMAT: 'report',
  ASS_END_BEFORE_START: 'report',
  ASS_FORMAT_MISSING: 'report',
  ASS_UNPARSEABLE_EVENT: 'report',
  VTT_HEADER_MISSING: 'auto',
  VTT_TIME_FORMAT: 'auto',
  VTT_MISSING_BLANK_LINE: 'auto',
  VTT_ARROW_IN_TEXT: 'auto',
  VTT_EOL_MIXED: 'auto',
  VTT_END_BEFORE_START: 'report',
  VTT_EMPTY_CUE: 'report',
  VTT_UNPARSEABLE_BLOCK: 'report',
  SEG_MARKER_COLLISION: 'report'
}

/** Referência estável a um item do documento. */
export type ItemRef = { kind: 'cue'; cueId: number } | { kind: 'block'; blockIndex: number }

export interface Diagnostic {
  readonly code: DiagnosticCode
  readonly severity: DiagnosticSeverity
  readonly fix: FixPolicy
  /** 1-based. */
  readonly line: number
  /** 1-based. */
  readonly column: number
  readonly ref?: ItemRef
  /** Parâmetros para a UI localizar a mensagem (o Main não envia texto localizado). */
  readonly params?: Readonly<Record<string, string | number>>
}

/** Correção aplicada pelo serializer reparado (uma por ocorrência). */
export interface AppliedFix {
  readonly code: DiagnosticCode
  readonly ref?: ItemRef
  readonly line?: number
}

export function diagnostic(
  code: DiagnosticCode,
  severity: DiagnosticSeverity,
  at: { line: number; column?: number },
  extra: { ref?: ItemRef; params?: Record<string, string | number> } = {}
): Diagnostic {
  return { code, severity, fix: FIX_POLICY[code], line: at.line, column: at.column ?? 1, ...extra }
}
