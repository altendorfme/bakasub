import { br, tag, text } from '../core/nodes'
import type { Node } from '../core/types'

/**
 * Tags HTML-like reconhecidas (whitelist). Qualquer outra coisa entre `<>` é texto:
 * "<3", "a < b", "<Nome>", "<br>".
 * Atributos não são interpretados; ficam no `raw`.
 */
const HTML_TAG = /<(\/)?(i|b|u|s|font|c|v|lang)(?=[\s.>])[^<>\r\n]*>/iy

/** Bloco de override estilo ASS que vaza para SRT. Sem `\` dentro, é texto ("{laughs}"). */
const OVERRIDE = /\{[^{}\r\n]*\\[^{}\r\n]*\}/y

/**
 * Tokeniza o conteúdo textual de um cue. Invariante: a concatenação dos `raw` dos nós
 * devolvidos é exatamente `input`, e nunca há dois TextNodes adjacentes nem TextNode vazio.
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

    if (ch === '\n' || ch === '\r') {
      flush()
      const raw = ch === '\r' && input[i + 1] === '\n' ? '\r\n' : ch
      nodes.push(br(raw))
      i += raw.length
      continue
    }

    if (ch === '<') {
      HTML_TAG.lastIndex = i
      const m = HTML_TAG.exec(input)
      if (m) {
        flush()
        nodes.push(tag(m[0], m[2].toLowerCase(), m[1] ? 'close' : 'open'))
        i += m[0].length
        continue
      }
    } else if (ch === '{') {
      OVERRIDE.lastIndex = i
      const m = OVERRIDE.exec(input)
      if (m) {
        flush()
        nodes.push(tag(m[0], '', 'override'))
        i += m[0].length
        continue
      }
    }

    buf += ch
    i++
  }
  flush()
  return nodes
}
