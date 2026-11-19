import { br, tag, text } from '../core/nodes'
import type { Node } from '../core/types'

/** Bloco com UMA única tag booleana (`{\i1}`, `{\b0}`…): vira par abrir/fechar. */
const BOOLEAN_BLOCK = /^\{\\([ibus])([01])\}$/

/**
 * Tokeniza o campo `Text` de um evento. Invariante: a concatenação dos `raw` é exatamente `input`,
 * sem TextNode vazio nem dois TextNodes adjacentes.
 *
 * - Todo `{...}` é Tag (libass trata blocos sem barra como comentário invisível, diferente do SRT).
 * - `\N` e `\n` são quebras de linha (`raw` guarda a sequência de duas letras); `\h` fica no texto.
 * - `{` sem `}` correspondente é texto.
 */
export function lexInline(input: string): Node[] {
  const nodes: Node[] = []
  let buf = ''
  const flush = (): void => {
    if (buf) {
      nodes.push(text(buf))
      buf = ''
    }
  }

  let i = 0
  while (i < input.length) {
    const ch = input[i]

    if (ch === '{') {
      const close = input.indexOf('}', i + 1)
      if (close !== -1) {
        flush()
        const raw = input.slice(i, close + 1)
        const bool = BOOLEAN_BLOCK.exec(raw)
        nodes.push(
          bool ? tag(raw, bool[1], bool[2] === '1' ? 'open' : 'close') : tag(raw, '', 'override')
        )
        i = close + 1
        continue
      }
    } else if (ch === '\\' && (input[i + 1] === 'N' || input[i + 1] === 'n')) {
      flush()
      nodes.push(br(input.slice(i, i + 2)))
      i += 2
      continue
    }

    buf += ch
    i++
  }
  flush()
  return nodes
}
