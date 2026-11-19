import { diagnostic, type Diagnostic } from '../core/diagnostics'
import { SubtitleParseError } from '../core/format'
import type { Cue, DocumentMeta, Item, SubtitleDocument, UnparsedBlock } from '../core/types'
import { metaFromText } from '../decode/subtitle-decoder'
import { scanBlocks } from './block-scanner'
import { lexInline } from './inline-lexer'
import type { SrtCueData } from './types'

const EOL_RE = /\r\n|\r|\n/g

function countEols(s: string): number {
  return s.match(EOL_RE)?.length ?? 0
}

/** Linha termina em espaço/tab (antes de quebra ou do fim do cue). */
function hasTrailingWhitespace(cue: Cue<SrtCueData>): boolean {
  return cue.nodes.some(
    (n, k) =>
      n.type === 'text' &&
      /[ \t]$/.test(n.value) &&
      (k === cue.nodes.length - 1 || cue.nodes[k + 1].type === 'br')
  )
}

/**
 * Nunca lança por conteúdo. Lança `SubtitleParseError` apenas para entrada vazia
 * ou quando nenhum cue válido foi encontrado.
 */
export function parseSrt(
  input: string,
  meta: DocumentMeta = metaFromText(input)
): SubtitleDocument<SrtCueData> {
  if (input.trim() === '') throw new SubtitleParseError('EMPTY_INPUT', 'Arquivo de legenda vazio')

  const scanned = scanBlocks(input)
  const items: Item<SrtCueData>[] = []
  const diagnostics: Diagnostic[] = []
  const seenIndexes = new Set<number>()

  let prevEnd = 0
  let cueCount = 0
  let prevCue: Cue<SrtCueData> | null = null

  if (meta.eol === 'mixed') diagnostics.push(diagnostic('SRT_EOL_MIXED', 'warn', { line: 1 }))

  for (const [position, s] of scanned.entries()) {
    const leading = input.slice(prevEnd, s.start)
    prevEnd = s.end
    // Linhas "em branco" com espaços/tabs: alguns leitores não as tratam como separador.
    if (/[^\r\n]/.test(leading)) {
      diagnostics.push(diagnostic('SRT_TRAILING_WS', 'info', { line: s.line }))
    }

    if (s.kind === 'unparsed') {
      const block: UnparsedBlock = {
        kind: 'unparsed',
        blockIndex: position,
        raw: input.slice(s.start, s.end),
        leading,
        reason: s.reason,
        line: s.line,
        endLine: s.endLine
      }
      items.push(block)
      diagnostics.push(
        diagnostic(
          'SRT_UNPARSEABLE_BLOCK',
          'warn',
          { line: s.line },
          {
            ref: { kind: 'block', blockIndex: position },
            params: { reason: s.reason }
          }
        )
      )
      continue
    }

    const { parsed } = s.timing
    const cue: Cue<SrtCueData> = {
      kind: 'cue',
      id: ++cueCount,
      start: parsed.start,
      end: parsed.end,
      nodes: lexInline(input.slice(s.textStart, s.end)),
      leading,
      line: s.line,
      endLine: s.endLine,
      format: {
        index: s.index,
        timingRaw: s.timing.raw,
        timingEol: s.timingEol,
        extras: parsed.extras
      }
    }
    items.push(cue)

    const ref = { kind: 'cue', cueId: cue.id } as const
    const timingLine = s.index ? s.line + 1 : s.line
    const at = { line: s.line }
    const push = (d: Diagnostic): number => diagnostics.push(d)

    // Índice
    if (!s.index) push(diagnostic('SRT_INDEX_MISSING', 'info', at, { ref }))
    else {
      const n = Number(s.index.raw.trim())
      if (seenIndexes.has(n))
        push(diagnostic('SRT_INDEX_DUPLICATE', 'warn', at, { ref, params: { index: n } }))
      else if (n !== cue.id)
        push(
          diagnostic('SRT_INDEX_GAP', 'info', at, { ref, params: { index: n, expected: cue.id } })
        )
      seenIndexes.add(n)
    }

    if (s.ambiguousIndex)
      push(
        diagnostic(
          'SRT_AMBIGUOUS_INDEX',
          'warn',
          { line: s.ambiguousIndex.line },
          { ref, params: { value: s.ambiguousIndex.value } }
        )
      )

    // Separação entre cues
    if (position > 0 && countEols(leading) < 2)
      push(diagnostic('SRT_MISSING_BLANK_LINE', 'info', at, { ref }))

    // Timing
    const tAt = { line: timingLine }
    if (parsed.quirks.dotSeparator) push(diagnostic('SRT_TIME_DOT_SEPARATOR', 'info', tAt, { ref }))
    if (parsed.quirks.padding) push(diagnostic('SRT_TIME_PADDING', 'info', tAt, { ref }))
    if (parsed.quirks.arrowSpacing) push(diagnostic('SRT_ARROW_SPACING', 'info', tAt, { ref }))
    if (parsed.extras.trim() !== '')
      push(
        diagnostic('SRT_TIMING_EXTRAS', 'warn', tAt, {
          ref,
          params: { extras: parsed.extras.trim() }
        })
      )
    else if (parsed.extras !== '') push(diagnostic('SRT_TRAILING_WS', 'info', tAt, { ref }))
    if (parsed.end.ms < parsed.start.ms)
      push(diagnostic('SRT_END_BEFORE_START', 'warn', tAt, { ref }))
    if (prevCue && parsed.start.ms < prevCue.end.ms) {
      push(diagnostic('SRT_OVERLAP', 'warn', tAt, { ref, params: { previousCueId: prevCue.id } }))
    }

    // Texto
    if (cue.nodes.length === 0) {
      push(diagnostic('SRT_EMPTY_CUE', 'info', at, { ref }))
    } else if (hasTrailingWhitespace(cue)) {
      push(diagnostic('SRT_TRAILING_WS', 'info', at, { ref }))
    }

    prevCue = cue
  }

  if (cueCount === 0) {
    throw new SubtitleParseError('NO_VALID_CUES', 'Nenhum cue SRT válido encontrado')
  }

  const trailing = input.slice(prevEnd)
  if (/[^\r\n]/.test(trailing)) {
    diagnostics.push(
      diagnostic('SRT_TRAILING_WS', 'info', { line: input.split(/\r\n|\r|\n/).length })
    )
  }

  return {
    format: 'srt',
    items,
    trailing,
    meta,
    diagnostics
  }
}
