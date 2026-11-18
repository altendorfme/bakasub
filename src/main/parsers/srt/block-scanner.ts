import type { UnparsedReason } from '../core/types'
import { parseTimingLine, type ParsedTiming } from './timing-line'

interface Line {
  /** Offset do primeiro caractere da linha. */
  start: number
  /** Offset logo após o último caractere do conteúdo (antes do EOL). */
  end: number
  /** Offset logo após o EOL. */
  next: number
  text: string
  eol: string
  /** 1-based. */
  no: number
}

export interface ScannedCue {
  kind: 'cue'
  /** Offset inicial do bloco (linha de índice, ou de timing se não houver índice). */
  start: number
  /** Offset final do bloco (fim do conteúdo da última linha; sem o EOL dela). */
  end: number
  line: number
  endLine: number
  index: { raw: string; eol: string } | null
  timing: { raw: string; parsed: ParsedTiming }
  /** EOL entre a linha de timing e o texto ('' quando o cue não tem texto). */
  timingEol: string
  /** Região do texto: input.slice(textStart, end). Vazia quando o cue não tem texto. */
  textStart: number
}

export interface ScannedUnparsed {
  kind: 'unparsed'
  start: number
  end: number
  line: number
  endLine: number
  reason: UnparsedReason
}

export type ScannedItem = ScannedCue | ScannedUnparsed

const BLANK = /^\s*$/
const INDEX = /^\s*\d+\s*$/

function splitLines(input: string): Line[] {
  const lines: Line[] = []
  let pos = 0
  while (pos < input.length) {
    let end = pos
    while (end < input.length && input.charCodeAt(end) !== 10 && input.charCodeAt(end) !== 13) end++
    let next = end
    if (input.charCodeAt(end) === 13 && input.charCodeAt(end + 1) === 10) next = end + 2
    else if (end < input.length) next = end + 1
    lines.push({
      start: pos,
      end,
      next,
      text: input.slice(pos, end),
      eol: input.slice(end, next),
      no: lines.length + 1
    })
    pos = next
  }
  return lines
}

/**
 * Divide o arquivo em cues e blocos não parseados, ancorando nas linhas de timing ("-->").
 *
 * Um cue começa numa linha de timing válida (precedida, se existir, por uma linha só com dígitos
 * que vira o índice). O texto vai até: linha em branco, outra linha de timing, ou índice+timing
 * colados. Linhas não-vazias fora de qualquer cue formam blocos `unparsed`.
 *
 * Os offsets garantem o round-trip: o texto entre itens (EOL + linhas em branco) é recuperado
 * por quem consome via `input.slice(prevEnd, item.start)`.
 */
export function scanBlocks(input: string): ScannedItem[] {
  const lines = splitLines(input)
  const items: ScannedItem[] = []

  const isTiming = (i: number): boolean =>
    i < lines.length && parseTimingLine(lines[i].text) !== null
  /** Início de cue em `i`: timing direto, ou índice imediatamente seguido de timing. */
  const startsCue = (i: number): boolean =>
    isTiming(i) || (i + 1 < lines.length && INDEX.test(lines[i].text) && isTiming(i + 1))

  let i = 0
  while (i < lines.length) {
    if (BLANK.test(lines[i].text)) {
      i++
      continue
    }

    if (startsCue(i)) {
      const indexLine = isTiming(i) ? null : lines[i]
      const t = indexLine ? i + 1 : i
      const timingLine = lines[t]
      const parsed = parseTimingLine(timingLine.text)!

      let j = t + 1
      while (j < lines.length && !BLANK.test(lines[j].text) && !startsCue(j)) j++
      const hasText = j > t + 1
      items.push({
        kind: 'cue',
        start: (indexLine ?? timingLine).start,
        end: hasText ? lines[j - 1].end : timingLine.end,
        line: (indexLine ?? timingLine).no,
        endLine: hasText ? lines[j - 1].no : timingLine.no,
        index: indexLine ? { raw: indexLine.text, eol: indexLine.eol } : null,
        timing: { raw: timingLine.text, parsed },
        timingEol: hasText ? timingLine.eol : '',
        textStart: hasText ? lines[t + 1].start : timingLine.end
      })
      i = j
      continue
    }

    // Execução de linhas não-vazias que não pertencem a nenhum cue.
    let j = i
    while (j < lines.length && !BLANK.test(lines[j].text) && !startsCue(j)) j++
    const run = lines.slice(i, j)
    const reason: UnparsedReason = run.some((l) => l.text.includes('-->'))
      ? 'bad-timing'
      : run.length === 1 && INDEX.test(run[0].text)
        ? 'empty-block'
        : 'orphan-text'
    items.push({
      kind: 'unparsed',
      start: run[0].start,
      end: run[run.length - 1].end,
      line: run[0].no,
      endLine: run[run.length - 1].no,
      reason
    })
    i = j
  }
  return items
}
