import type { InlineLexer } from '../format'
import { text } from '../nodes'
import type { Cue, Node } from '../types'
import { tokenizePayload, type InlineTag } from './payload-codec'
import type { TranslationUnit } from './segmenter'
import { validateTokens, type Issue } from './validator'

export type ApplyResult<F> = { ok: true; cue: Cue<F> } | { ok: false; issues: Issue[] }

/** Valida sem montar nada (útil para o retry de chunk do LLM). */
export function validateTranslation(
  unit: TranslationUnit,
  translated: string,
  lexInline: InlineLexer
): Issue[] {
  return validateTokens(unit.skeleton, tokenizePayload(translated), lexInline)
}

/**
 * Devolve um novo Cue com o texto traduzido; timecodes, `leading`, `format` e as tags originais
 * (reaplicadas a partir do esqueleto) permanecem intactos. Não faz trim: isso é política do
 * chamador. Uma tradução idêntica ao payload reproduz o cue original.
 */
export function applyTranslation<F>(
  cue: Cue<F>,
  unit: TranslationUnit,
  translated: string,
  lexInline: InlineLexer
): ApplyResult<F> {
  const tokens = tokenizePayload(translated)
  const issues = validateTokens(unit.skeleton, tokens, lexInline)
  if (issues.length > 0) return { ok: false, issues }

  const { head, tail, markers, brs, inline } = unit.skeleton
  const middle: Node[] = []
  let brIndex = 0
  let segment = 0
  let segmentText = ''
  const flush = (): void => {
    middle.push(...withInlineTags(segmentText, inline, segment))
    segmentText = ''
  }
  for (const tok of tokens) {
    if (tok.t === 'text') {
      segmentText += tok.value
      continue
    }
    flush()
    segment++
    switch (tok.t) {
      case 'br':
        middle.push(brs[brIndex++])
        break
      case 'x':
        middle.push((markers[tok.id] as { node: Node }).node)
        break
      case 'open':
        middle.push((markers[tok.id] as { open: Node }).open)
        break
      case 'close':
        middle.push((markers[tok.id] as { close: Node }).close)
        break
    }
  }
  flush()
  return { ok: true, cue: { ...cue, nodes: [...head, ...middle, ...tail] } }
}

const LETTER = /\p{L}/u

/** Fronteira `p` com letra dos dois lados (`s[p-1]` e `s[p]`): o override fica dentro da palavra. */
const insideWord = (s: string, p: number): boolean =>
  p > 0 && p < s.length && LETTER.test(s[p - 1]) && LETTER.test(s[p])

/**
 * Posição para o override intra-palavra: a mesma fração do segmento traduzido, ajustada para a
 * fronteira entre letras mais próxima a partir de `min` (mantém a ordem original). Sem nenhuma,
 * fica na posição proporcional.
 */
function placeInline(s: string, ratio: number, min: number): number {
  const target = Math.min(s.length, Math.max(min, Math.round(ratio * s.length)))
  for (let d = 0; d <= s.length; d++) {
    if (insideWord(s, target + d)) return target + d
    if (target - d >= min && insideWord(s, target - d)) return target - d
  }
  return target
}

/** Texto do segmento com os overrides intra-palavra dele reinseridos; nunca perde um override. */
function withInlineTags(value: string, inline: readonly InlineTag[], segment: number): Node[] {
  const tags = inline.filter((t) => t.segment === segment)
  if (tags.length === 0) return value ? [text(value)] : []
  const out: Node[] = []
  let cursor = 0
  for (const tag of tags) {
    const at = placeInline(value, tag.ratio, cursor)
    if (at > cursor) out.push(text(value.slice(cursor, at)))
    out.push(tag.node)
    cursor = at
  }
  if (cursor < value.length) out.push(text(value.slice(cursor)))
  return out
}
