import { createHash } from 'node:crypto'
import {
  classify,
  cuePlainText,
  normalizeForHash,
  speakerOf,
  type Cue,
  type SubtitleDocument,
  type TranslationUnit
} from '../parsers'

/** Sobe quando a normalização ou a composição mudar: entradas antigas deixam de casar. */
export const CONTEXT_HASH_VERSION = 'v2'
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
  /** Início e fim do cue (ms). Usados para cortar o arquivo em lanes nos intervalos entre falas. */
  readonly startMs: number
  readonly endMs: number
  /** Texto puro normalizado do cue (contexto do LLM e linha anterior do hash). */
  readonly plain: string
  /** Falante (`Cue.actor` sem valores genéricos, ver `speakerOf`). Vai ao prompt e ao hash. */
  readonly speaker?: string
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
 * Sem falante: `hash = sha256("v2\0" + prev + "\0" + payload)`.
 * Com falante: `hash = sha256("v2\x01" + speaker + "\0" + prev + "\0" + payload)`.
 *
 * `payload` normalizado (texto + forma dos marcadores; o `raw` das tags não entra), `prev` = texto
 * puro normalizado do cue traduzível anterior por `start.ms` (empate: ordem do arquivo), apenas
 * quando o cue atual tem até 3 palavras, e `speaker` = `speakerOf(cue.actor)` (sem genéricos e sem
 * caracteres de controle, então o `\x01` após a versão e o primeiro `\0` delimitam o campo sem
 * ambiguidade). A mesma frase dita por personagens diferentes vira entradas (e unidades) distintas.
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
    const speaker = speakerOf(cue.actor)
    const contextUsed = countWords(plain, options.sourceLang) <= SHORT_SENTENCE_WORDS
    const head = speaker ? `${CONTEXT_HASH_VERSION}\x01${speaker}` : CONTEXT_HASH_VERSION
    const hash = sha256(`${head}\0${contextUsed ? prev : ''}\0${normalizeForHash(unit.payload)}`)
    out.set(cue.id, {
      cueId: cue.id,
      hash,
      unit,
      contextUsed,
      timeIndex,
      startMs: cue.start.ms,
      endMs: cue.end.ms,
      plain,
      ...(speaker ? { speaker } : {})
    })
    prev = plain
  }
  return translatable.map(({ cue }) => out.get(cue.id)!)
}
