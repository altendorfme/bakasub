import { diagnostic, type Diagnostic } from '../core/diagnostics'
import { SubtitleParseError } from '../core/format'
import type { Cue, DocumentMeta, Item, SubtitleDocument, UnparsedBlock } from '../core/types'
import { metaFromText } from '../decode/subtitle-decoder'
import type { EventFormat } from './event-format'
import { lexInline } from './inline-lexer'
import { scanEvents } from './line-scanner'
import { parseAssTime } from './time'
import type { AssCueData } from './types'

interface SplitEvent {
  prefix: string
  fields: string[]
  text: string
}

/** Separa nas primeiras `count - 1` vírgulas; o restante é o `Text` (que pode ter vírgulas). */
function splitEvent(line: string, count: number): SplitEvent | null {
  const fields: string[] = []
  let from = line.indexOf(':') + 1
  for (let k = 0; k < count - 1; k++) {
    const comma = line.indexOf(',', from)
    if (comma === -1) return null
    fields.push(line.slice(from, comma))
    from = comma + 1
  }
  return { prefix: line.slice(0, from), fields, text: line.slice(from) }
}

const field = (fields: readonly string[], idx: number): string =>
  idx >= 0 ? fields[idx].trim() : ''

type EventResult =
  | { ok: true; cue: Omit<Cue<AssCueData>, 'id' | 'leading' | 'line' | 'endLine'>; notes: Quirk[] }
  | { ok: false; reason: 'columns' | 'time' }
type Quirk = 'ASS_TIME_FORMAT' | 'ASS_END_BEFORE_START'

function parseEvent(line: string, f: EventFormat): EventResult {
  const split = splitEvent(line, f.count)
  if (!split) return { ok: false, reason: 'columns' }
  const start = parseAssTime(split.fields[f.start])
  const end = parseAssTime(split.fields[f.end])
  if (!start || !end) return { ok: false, reason: 'time' }

  const notes: Quirk[] = []
  if (!start.canonical || !end.canonical) notes.push('ASS_TIME_FORMAT')
  if (end.timecode.ms < start.timecode.ms) notes.push('ASS_END_BEFORE_START')

  const style = field(split.fields, f.style)
  const actor = field(split.fields, f.name)
  return {
    ok: true,
    notes,
    cue: {
      kind: 'cue',
      start: start.timecode,
      end: end.timecode,
      nodes: lexInline(split.text),
      ...(style ? { style } : {}),
      ...(actor ? { actor } : {}),
      format: {
        prefix: split.prefix,
        layer: field(split.fields, f.layer),
        marginL: field(split.fields, f.marginL),
        marginR: field(split.fields, f.marginR),
        marginV: field(split.fields, f.marginV),
        effect: field(split.fields, f.effect)
      }
    }
  }
}

/**
 * Nunca lança por conteúdo. Lança `SubtitleParseError` apenas para entrada vazia ou sem nenhum
 * evento `Dialogue:` legível. Só `Dialogue:` de `[Events]` vira Cue; o resto é trivia em `leading`.
 */
export function parseAss(
  input: string,
  meta: DocumentMeta = metaFromText(input)
): SubtitleDocument<AssCueData> {
  if (input.trim() === '') throw new SubtitleParseError('EMPTY_INPUT', 'Arquivo de legenda vazio')

  const scan = scanEvents(input)
  const items: Item<AssCueData>[] = []
  const diagnostics: Diagnostic[] = []
  let cueCount = 0
  let prevEnd = 0

  if (meta.eol === 'mixed') diagnostics.push(diagnostic('ASS_EOL_MIXED', 'warn', { line: 1 }))
  for (const n of scan.formatNotes)
    diagnostics.push(
      diagnostic('ASS_FORMAT_MISSING', 'warn', { line: n.line }, { params: { reason: n.reason } })
    )

  for (const ev of scan.events) {
    const leading = input.slice(prevEnd, ev.start)
    const raw = input.slice(ev.start, ev.end)
    prevEnd = ev.end
    const parsed = parseEvent(raw, ev.format)

    if (!parsed.ok) {
      const block: UnparsedBlock = {
        kind: 'unparsed',
        blockIndex: items.length,
        raw,
        leading,
        reason: 'bad-event',
        line: ev.line,
        endLine: ev.line
      }
      diagnostics.push(
        diagnostic(
          'ASS_UNPARSEABLE_EVENT',
          'warn',
          { line: ev.line },
          {
            ref: { kind: 'block', blockIndex: block.blockIndex },
            params: { reason: parsed.reason }
          }
        )
      )
      items.push(block)
      continue
    }

    const cue: Cue<AssCueData> = {
      ...parsed.cue,
      id: ++cueCount,
      leading,
      line: ev.line,
      endLine: ev.line
    }
    items.push(cue)
    for (const code of parsed.notes)
      diagnostics.push(
        diagnostic(
          code,
          code === 'ASS_TIME_FORMAT' ? 'info' : 'warn',
          { line: ev.line },
          {
            ref: { kind: 'cue', cueId: cue.id }
          }
        )
      )
  }

  if (cueCount === 0)
    throw new SubtitleParseError(
      'NO_VALID_CUES',
      'Nenhum evento Dialogue ASS/SSA válido encontrado'
    )

  return {
    format: scan.dialect,
    items,
    trailing: input.slice(prevEnd),
    meta,
    diagnostics
  }
}
