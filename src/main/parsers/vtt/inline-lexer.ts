import { br, tag, text } from '../core/nodes'
import type { Node } from '../core/types'

/** Tags de cue do WebVTT (whitelist). Classes (`.x`) e anotação ficam no `raw`. */
const TAG = /<(\/)?(c|i|b|u|v|lang|ruby|rt)(?=[\s.>])[^<>\r\n]*>/iy
/** Timestamp interno (`<00:01.500>`): marca tempo de karaokê; não tem par. */
const TIMESTAMP = /<(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}>/y
const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|nbsp|lrm|rlm|quot|apos));/y

const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: '\u00a0',
  lrm: '\u200e',
  rlm: '\u200f',
  quot: '"',
  apos: "'"
}

function decodeEntity(m: RegExpExecArray): string | null {
  if (m[3]) return NAMED[m[3]]
  const cp = m[1] ? Number(m[1]) : parseInt(m[2], 16)
  // Fora do Unicode, surrogate ou NUL: não decodifica (fica literal).
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null
  return String.fromCodePoint(cp)
}

/**
 * Tokeniza o texto de um cue WebVTT. Invariantes: a concatenação de `raw ?? value` é `input`;
 * nunca há TextNodes adjacentes nem vazios. Entidades são decodificadas em `value`.
 */
export function lexVttInline(input: string): Node[] {
  const nodes: Node[] = []
  let value = ''
  let raw = ''
  const flush = (): void => {
    if (raw) nodes.push(text(value, raw))
    value = ''
    raw = ''
  }

  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === '\n' || ch === '\r') {
      flush()
      const eol = ch === '\r' && input[i + 1] === '\n' ? '\r\n' : ch
      nodes.push(br(eol))
      i += eol.length
      continue
    }
    if (ch === '<') {
      TAG.lastIndex = i
      const m = TAG.exec(input)
      if (m) {
        flush()
        nodes.push(tag(m[0], m[2].toLowerCase(), m[1] ? 'close' : 'open'))
        i += m[0].length
        continue
      }
      TIMESTAMP.lastIndex = i
      const t = TIMESTAMP.exec(input)
      if (t) {
        flush()
        nodes.push(tag(t[0], 'timestamp', 'override'))
        i += t[0].length
        continue
      }
    } else if (ch === '&') {
      ENTITY.lastIndex = i
      const m = ENTITY.exec(input)
      const decoded = m ? decodeEntity(m) : null
      if (m && decoded !== null) {
        value += decoded
        raw += m[0]
        i += m[0].length
        continue
      }
    }
    value += ch
    raw += ch
    i++
  }
  flush()
  return nodes
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '\u00a0': '&nbsp;',
  '\u200e': '&lrm;',
  '\u200f': '&rlm;'
}

/** Inverso do lexer para texto novo (tradução): `-->` no texto vira `--&gt;`, sempre válido. */
export function escapeVttText(value: string): string {
  return value.replace(/[&<>\u00a0\u200e\u200f]/g, (c) => ESCAPES[c])
}

const VOICE = /^<v(?:\.[^\s>]*)*[ \t]+([^>]*)>$/i

/** Falante da primeira tag `<v Nome>`; `undefined` sem anotação. */
export function voiceOf(nodes: readonly Node[]): string | undefined {
  for (const n of nodes) {
    if (n.type !== 'tag' || n.name !== 'v' || n.kind !== 'open') continue
    const name = VOICE.exec(n.raw)?.[1].trim()
    return name || undefined
  }
  return undefined
}
