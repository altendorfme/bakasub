import type { InlineLexer } from '../format'
import type { Skeleton, Token } from './payload-codec'

export type IssueCode =
  | 'MISSING_MARKER'
  | 'UNEXPECTED_MARKER'
  | 'DUPLICATE_MARKER'
  | 'BAD_NESTING'
  | 'BR_COUNT_MISMATCH'
  | 'RAW_NEWLINE'
  | 'INVENTED_TAG'
  | 'MARKER_ORDER'
  | 'EMPTY_TRANSLATION'

export interface Issue {
  readonly code: IssueCode
  readonly id?: number
  readonly expected?: number
  readonly actual?: number
}

/**
 * Valida a tradução contra o esqueleto: cada marcador exatamente uma vez, pares bem aninhados,
 * mesma quantidade de <br/>, sem quebra de linha crua e sem tags inventadas pelo modelo.
 * A posição das palavras e dos pares é livre (idiomas reordenam); marcadores soltos (`<xN/>`)
 * mantêm a ordem relativa original (`MARKER_ORDER`).
 */
export function validateTokens(
  skeleton: Skeleton,
  tokens: readonly Token[],
  lexInline: InlineLexer
): Issue[] {
  const issues: Issue[] = []
  const { markers } = skeleton
  const opened = new Set<number>()
  const closed = new Set<number>()
  const singles = new Set<number>()
  let lastSingle = 0
  const stack: number[] = []
  let brCount = 0
  let sawNewline = false
  let sawInvented = false
  let anyText = false

  for (const tok of tokens) {
    switch (tok.t) {
      case 'text': {
        if (tok.value.trim() !== '') anyText = true
        const lexed = lexInline(tok.value)
        // Quebra "crua" = qualquer quebra que o lexer do formato reconheça (EOL no SRT, `\N` no ASS).
        if (!sawNewline && (/[\r\n]/.test(tok.value) || lexed.some((n) => n.type === 'br'))) {
          sawNewline = true
          issues.push({ code: 'RAW_NEWLINE' })
        }
        if (!sawInvented && lexed.some((n) => n.type === 'tag')) {
          sawInvented = true
          issues.push({ code: 'INVENTED_TAG' })
        }
        break
      }
      case 'br':
        brCount++
        break
      case 'open': {
        if (markers[tok.id]?.kind !== 'pair') issues.push({ code: 'UNEXPECTED_MARKER', id: tok.id })
        else if (opened.has(tok.id)) issues.push({ code: 'DUPLICATE_MARKER', id: tok.id })
        else {
          opened.add(tok.id)
          stack.push(tok.id)
        }
        break
      }
      case 'close': {
        if (markers[tok.id]?.kind !== 'pair') issues.push({ code: 'UNEXPECTED_MARKER', id: tok.id })
        else if (closed.has(tok.id)) issues.push({ code: 'DUPLICATE_MARKER', id: tok.id })
        else if (!opened.has(tok.id) || stack[stack.length - 1] !== tok.id) {
          issues.push({ code: 'BAD_NESTING', id: tok.id })
        } else {
          closed.add(tok.id)
          stack.pop()
        }
        break
      }
      case 'x': {
        if (markers[tok.id]?.kind !== 'single')
          issues.push({ code: 'UNEXPECTED_MARKER', id: tok.id })
        else if (singles.has(tok.id)) issues.push({ code: 'DUPLICATE_MARKER', id: tok.id })
        else {
          singles.add(tok.id)
          // Overrides soltos têm efeito posicional: a ordem relativa original é preservada.
          if (tok.id < lastSingle) issues.push({ code: 'MARKER_ORDER', id: tok.id })
          lastSingle = Math.max(lastSingle, tok.id)
        }
        break
      }
    }
  }

  for (const [key, marker] of Object.entries(markers)) {
    const id = Number(key)
    const present = marker.kind === 'pair' ? opened.has(id) && closed.has(id) : singles.has(id)
    const alreadyReported = issues.some((i) => i.id === id)
    if (!present && !alreadyReported) issues.push({ code: 'MISSING_MARKER', id })
  }
  if (brCount !== skeleton.brs.length) {
    issues.push({ code: 'BR_COUNT_MISMATCH', expected: skeleton.brs.length, actual: brCount })
  }
  if (!anyText) issues.push({ code: 'EMPTY_TRANSLATION' })
  return issues
}
