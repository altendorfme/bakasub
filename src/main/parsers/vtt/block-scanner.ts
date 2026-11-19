import { splitLines, type Line } from '../core/lines'
import type { UnparsedReason } from '../core/types'
import { parseVttTiming, type ParsedVttTiming } from './timing-line'

export interface ScannedVttCue {
  kind: 'cue'
  /** Offset do identificador (ou do timing, sem identificador). */
  start: number
  /** Fim do conteúdo da última linha do cue (sem o EOL). */
  end: number
  line: number
  endLine: number
  identifier: { raw: string; eol: string } | null
  timing: { raw: string; parsed: ParsedVttTiming; line: number }
  timingEol: string
  /** Região do texto: input.slice(textStart, end). */
  textStart: number
  /** Começa sem linha em branco antes (colado a um cue ou a um bloco de trivia). */
  glued: boolean
}

export interface ScannedVttUnparsed {
  kind: 'unparsed'
  start: number
  end: number
  line: number
  endLine: number
  reason: UnparsedReason
}

export type ScannedVttItem = ScannedVttCue | ScannedVttUnparsed

export interface VttScan {
  /** A primeira linha é `WEBVTT` (opcionalmente seguida de espaço/tab e texto). */
  hasHeader: boolean
  items: ScannedVttItem[]
}

export const HEADER = /^WEBVTT(?:[ \t].*)?$/
/** Blocos de trivia: comentário, folha de estilo, região. */
const TRIVIA = /^(?:NOTE|STYLE|REGION)(?:[ \t].*)?$/
const BLANK = /^\s*$/

/**
 * Divide o arquivo em blocos (separados por linhas em branco) e cada bloco em cues ancorados nos
 * timings. Cabeçalho, NOTE, STYLE e REGION não viram itens: ficam no `leading` do item seguinte
 * (ou no `trailing` do documento). Dentro de um bloco, linhas antes de um timing colado pertencem
 * ao cue anterior, como no parser da spec; quem as relata é o `glued`.
 */
export function scanVtt(input: string): VttScan {
  const lines = splitLines(input)
  const hasHeader = lines.length > 0 && HEADER.test(lines[0].text)
  const items: ScannedVttItem[] = []

  let i = 0
  while (i < lines.length) {
    if (BLANK.test(lines[i].text)) {
      i++
      continue
    }
    let b = i
    while (b < lines.length && !BLANK.test(lines[b].text)) b++
    scanBlock(lines.slice(i, b), i === 0 && hasHeader, items)
    i = b
  }
  return { hasHeader, items }
}

function scanBlock(block: Line[], isHeader: boolean, items: ScannedVttItem[]): void {
  const timings = block.flatMap((l, k) => {
    const parsed = parseVttTiming(l.text)
    return parsed ? [{ k, parsed }] : []
  })
  const trivia = isHeader || TRIVIA.test(block[0].text)

  const pushUnparsed = (from: number, to: number): void => {
    const run = block.slice(from, to)
    items.push({
      kind: 'unparsed',
      start: run[0].start,
      end: run[run.length - 1].end,
      line: run[0].no,
      endLine: run[run.length - 1].no,
      reason: run.some((l) => l.text.includes('-->')) ? 'bad-timing' : 'orphan-text'
    })
  }

  if (timings.length === 0) {
    if (!trivia) pushUnparsed(0, block.length)
    return
  }

  const first = timings[0].k
  let identifier: Line | null = null
  // Trivia engole as linhas antes do primeiro timing; num bloco comum, a linha imediatamente
  // anterior é o identificador e o que vem antes dela não pertence a nenhum cue.
  if (!trivia && first > 0) {
    identifier = block[first - 1]
    if (first > 1) pushUnparsed(0, first - 1)
  }

  timings.forEach(({ k, parsed }, n) => {
    const timingLine = block[k]
    const stop = n + 1 < timings.length ? timings[n + 1].k : block.length
    const id = n === 0 ? identifier : null
    const hasText = stop > k + 1
    const last = hasText ? block[stop - 1] : timingLine
    items.push({
      kind: 'cue',
      start: (id ?? timingLine).start,
      end: last.end,
      line: (id ?? timingLine).no,
      endLine: last.no,
      identifier: id ? { raw: id.text, eol: id.eol } : null,
      timing: { raw: timingLine.text, parsed, line: timingLine.no },
      timingEol: hasText ? timingLine.eol : '',
      textStart: hasText ? block[k + 1].start : timingLine.end,
      glued: n > 0 || (trivia && k > 0)
    })
  })
}
