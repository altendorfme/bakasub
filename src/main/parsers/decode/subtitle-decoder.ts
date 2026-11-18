import { analyse } from 'chardet'
import type { DocumentMeta } from '../core/types'
import { analyzeEol } from './eol'

export interface DecodedSubtitle {
  text: string
  meta: DocumentMeta
}

/** Latin-1 e variantes ocidentais são, na prática, windows-1252 (superconjunto). */
const WESTERN = new Set(['iso-8859-1', 'iso-8859-15', 'windows-1252', 'ascii'])

/** Encodings que aceitamos de volta do detector; qualquer outro cai para windows-1252. */
const ALLOWED = new Set([
  'utf-16le',
  'utf-16be',
  'windows-1250',
  'windows-1251',
  'windows-1253',
  'windows-1254',
  'windows-1255',
  'windows-1256',
  'windows-1257',
  'windows-1258',
  'iso-8859-2',
  'iso-8859-5',
  'iso-8859-7',
  'iso-8859-9',
  'koi8-r',
  'shift_jis',
  'euc-jp',
  'euc-kr',
  'big5',
  'gb18030'
])

const FALLBACK = 'windows-1252'

function decodeWith(label: string, bytes: Uint8Array, fatal: boolean): string {
  // ignoreBOM: true => um U+FEFF residual é preservado (nada é descartado em silêncio).
  return new TextDecoder(label, { fatal, ignoreBOM: true }).decode(bytes)
}

function strictUtf8(bytes: Uint8Array): string | null {
  try {
    return decodeWith('utf-8', bytes, true)
  } catch {
    return null
  }
}

function build(
  text: string,
  encoding: string,
  confidence: number | null,
  bom: boolean
): DecodedSubtitle {
  return { text, meta: { encoding, confidence, bom, ...analyzeEol(text) } }
}

/** Metadados para texto já decodificado (testes e entradas que não vêm de arquivo). */
export function metaFromText(text: string): DocumentMeta {
  return build(text, 'utf-8', null, false).meta
}

/**
 * bytes -> texto + metadados. Ordem: BOM -> UTF-8 estrito -> detecção restrita.
 * Nunca lança: o pior caso é windows-1252 com confiança baixa, que a UI deve expor.
 */
export function decodeSubtitle(input: Uint8Array): DecodedSubtitle {
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    return build(decodeWith('utf-8', input.subarray(3), false), 'utf-8', null, true)
  }
  if (input.length >= 2 && input[0] === 0xff && input[1] === 0xfe) {
    return build(decodeWith('utf-16le', input.subarray(2), false), 'utf-16le', null, true)
  }
  if (input.length >= 2 && input[0] === 0xfe && input[1] === 0xff) {
    return build(decodeWith('utf-16be', input.subarray(2), false), 'utf-16be', null, true)
  }

  const utf8 = strictUtf8(input)
  if (utf8 !== null) return build(utf8, 'utf-8', null, false)

  const best = analyse(input)[0]
  const name = best?.name.toLowerCase() ?? ''
  const confidence = best ? best.confidence / 100 : 0
  const label = ALLOWED.has(name) && !WESTERN.has(name) ? name : FALLBACK
  try {
    return build(decodeWith(label, input, false), label, confidence, false)
  } catch {
    return build(decodeWith(FALLBACK, input, false), FALLBACK, confidence, false)
  }
}
