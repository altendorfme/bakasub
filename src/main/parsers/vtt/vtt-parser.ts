import { diagnostic, type Diagnostic } from '../core/diagnostics'
import { SubtitleParseError } from '../core/format'
import type { Cue, DocumentMeta, Item, SubtitleDocument } from '../core/types'
import { metaFromText } from '../decode/subtitle-decoder'
import { scanVtt } from './block-scanner'
import { lexVttInline, voiceOf } from './inline-lexer'
import type { VttCueData } from './types'

const EOL_RE = /\r\n|\r|\n/

/** Linha só com espaços/tabs: para a spec não é linha em branco (o cue seguinte fica colado). */
export const hasWhitespaceOnlyLine = (gap: string): boolean =>
  gap.split(EOL_RE).some((l) => l !== '' && /^\s*$/.test(l))

/** Nunca lança por conteúdo; só `SubtitleParseError` para entrada vazia ou sem cues. */
export function parseVtt(
  input: string,
  meta: DocumentMeta = metaFromText(input)
): SubtitleDocument<VttCueData> {
  if (input.trim() === '') throw new SubtitleParseError('EMPTY_INPUT', 'Arquivo de legenda vazio')

  const { hasHeader, items: scanned } = scanVtt(input)
  const items: Item<VttCueData>[] = []
  const diagnostics: Diagnostic[] = []
  const push = (d: Diagnostic): number => diagnostics.push(d)

  if (meta.eol === 'mixed') push(diagnostic('VTT_EOL_MIXED', 'warn', { line: 1 }))
  if (!hasHeader) push(diagnostic('VTT_HEADER_MISSING', 'info', { line: 1 }))

  let prevEnd = 0
  let cueCount = 0
  for (const [position, s] of scanned.entries()) {
    const leading = input.slice(prevEnd, s.start)
    prevEnd = s.end

    if (s.kind === 'unparsed') {
      items.push({
        kind: 'unparsed',
        blockIndex: position,
        raw: input.slice(s.start, s.end),
        leading,
        reason: s.reason,
        line: s.line,
        endLine: s.endLine
      })
      push(
        diagnostic(
          'VTT_UNPARSEABLE_BLOCK',
          'warn',
          { line: s.line },
          { ref: { kind: 'block', blockIndex: position }, params: { reason: s.reason } }
        )
      )
      continue
    }

    const { parsed } = s.timing
    const nodes = lexVttInline(input.slice(s.textStart, s.end))
    const actor = voiceOf(nodes)
    const cue: Cue<VttCueData> = {
      kind: 'cue',
      id: ++cueCount,
      start: parsed.start,
      end: parsed.end,
      nodes,
      ...(actor ? { actor } : {}),
      leading,
      line: s.line,
      endLine: s.endLine,
      format: {
        identifier: s.identifier,
        timingRaw: s.timing.raw,
        timingEol: s.timingEol,
        settings: parsed.settings
      }
    }
    items.push(cue)

    const ref = { kind: 'cue', cueId: cue.id } as const
    const tAt = { line: s.timing.line }
    if (s.glued || hasWhitespaceOnlyLine(leading))
      push(diagnostic('VTT_MISSING_BLANK_LINE', 'info', { line: s.line }, { ref }))
    if (parsed.quirks.format) push(diagnostic('VTT_TIME_FORMAT', 'info', tAt, { ref }))
    if (parsed.end.ms < parsed.start.ms)
      push(diagnostic('VTT_END_BEFORE_START', 'warn', tAt, { ref }))
    if (nodes.length === 0) push(diagnostic('VTT_EMPTY_CUE', 'info', { line: s.line }, { ref }))
    else if (nodes.some((n) => n.type === 'text' && (n.raw ?? n.value).includes('-->')))
      push(diagnostic('VTT_ARROW_IN_TEXT', 'warn', { line: s.line }, { ref }))
  }

  if (cueCount === 0) throw new SubtitleParseError('NO_VALID_CUES', 'Nenhum cue WebVTT válido')

  return { format: 'vtt', items, trailing: input.slice(prevEnd), meta, diagnostics }
}
