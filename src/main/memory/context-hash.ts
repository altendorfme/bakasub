import { createHash } from 'node:crypto'
import {
  classify,
  cuePlainText,
  normalizeForHash,
  type Cue,
  type SubtitleDocument,
  type TranslationUnit
} from '../parsers'

/** Sobe quando a normalização ou a composição mudar: entradas antigas deixam de casar. */
export const CONTEXT_HASH_VERSION = 'v1'
/** Frases com até este número de palavras levam a linha anterior no hash. */
export const SHORT_SENTENCE_WORDS = 3

export interface ContextHashOptions {
  /** Idioma de origem (BCP-47) para o `Intl.Segmenter`; ausente => locale padrão do ICU. */
  sourceLang?: string
}

export interface HashedUnit {
  readonly cueId: number
  readonly hash: string
  /** Unidade de tradução do cue (payload + esqueleto), já calculada por `classify`. */
  readonly unit: TranslationUnit
  /** `true` quando a linha anterior entrou no hash. */
  readonly contextUsed: boolean
  /** Posição na linha do tempo dos traduzíveis (`start.ms`, empate pela ordem do arquivo). */
  readonly timeIndex: number
  /** Texto puro normalizado do cue (contexto do LLM e linha anterior do hash). */
  readonly plain: string
}

const segmenters = new Map<string, Intl.Segmenter>()

function segmenterFor(lang: string | undefined): Intl.Segmenter {
  let locale: string | undefined
  try {
    locale = lang ? Intl.getCanonicalLocales(lang)[0] : undefined
  } catch {
    locale = undefined
  }
  const key = locale ?? ''
  let seg = segmenters.get(key)
  if (!seg) {
    seg = new Intl.Segmenter(locale, { granularity: 'word' })
    segmenters.set(key, seg)
  }
  return seg
}

/** Palavras segundo o ICU (`isWordLike`): pontuação não conta e CJK é segmentado por dicionário. */
export function countWords(text: string, lang?: string): number {
  let n = 0
  for (const s of segmenterFor(lang).segment(text)) if (s.isWordLike) n++
  return n
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

/**
 * Context hash do Job Memory para cada cue traduzível, em ordem de documento.
 *
 * `hash = sha256("v1\0" + prev + "\0" + payload)`, com `payload` normalizado (texto + forma dos
 * marcadores; o `raw` das tags não entra) e `prev` = texto puro normalizado do cue traduzível
 * anterior por `start.ms` (empate: ordem do arquivo), apenas quando o cue atual tem até 3 palavras.
 * Cues não traduzíveis (desenho, karaokê, sem letras…) não recebem hash nem servem de contexto.
 */
export function computeContextHashes(
  doc: SubtitleDocument<unknown>,
  options: ContextHashOptions = {}
): HashedUnit[] {
  const translatable: { cue: Cue<unknown>; unit: TranslationUnit; order: number }[] = []
  doc.items.forEach((item, order) => {
    if (item.kind !== 'cue') return
    const c = classify(item)
    if (c.status === 'translatable') translatable.push({ cue: item, unit: c.unit, order })
  })

  const byTime = [...translatable].sort(
    (a, b) => a.cue.start.ms - b.cue.start.ms || a.order - b.order
  )

  const out = new Map<number, HashedUnit>()
  let prev = ''
  for (const [timeIndex, { cue, unit }] of byTime.entries()) {
    const plain = normalizeForHash(cuePlainText(cue))
    const contextUsed = countWords(plain, options.sourceLang) <= SHORT_SENTENCE_WORDS
    const hash = sha256(
      `${CONTEXT_HASH_VERSION}\0${contextUsed ? prev : ''}\0${normalizeForHash(unit.payload)}`
    )
    out.set(cue.id, { cueId: cue.id, hash, unit, contextUsed, timeIndex, plain })
    prev = plain
  }
  return translatable.map(({ cue }) => out.get(cue.id)!)
}
