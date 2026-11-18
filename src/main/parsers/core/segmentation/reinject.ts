import type { InlineLexer } from '../format'
import { text } from '../nodes'
import type { Cue, Node } from '../types'
import { tokenizePayload } from './payload-codec'
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

  const { head, tail, markers, brs } = unit.skeleton
  const middle: Node[] = []
  let brIndex = 0
  for (const tok of tokens) {
    switch (tok.t) {
      case 'text': {
        const last = middle[middle.length - 1]
        if (last?.type === 'text') middle[middle.length - 1] = text(last.value + tok.value)
        else middle.push(text(tok.value))
        break
      }
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
  return { ok: true, cue: { ...cue, nodes: [...head, ...middle, ...tail] } }
}
