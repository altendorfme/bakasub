import type {
  GlossaryEntry,
  TermConsistencyReport,
  TermOccurrence,
  TermVariant,
  TermVariation
} from '../../shared/ipc-contract'
import { cuePlainText, normalizeForHash, type Cue, type SubtitleDocument } from '../parsers'

/**
 * Passada de consistência de termos, local e determinística (sem LLM).
 *
 * 1. Candidatos: palavras da origem que aparecem capitalizadas em ≥ `minCues` falas, ao menos
 *    uma vez no meio da frase (descarta "What", "Hey" de início de frase) e quase nunca em
 *    minúsculas (descarta palavras comuns). Pega nomes próprios, apelidos e termos do mundo.
 * 2. Variantes, por candidato, nas traduções das falas onde ele aparece:
 *    - "mantido": a própria palavra está na tradução;
 *    - associadas: de forma gulosa, entre as falas ainda não cobertas, a palavra da tradução
 *      mais ligada ao termo (coeficiente de Dice entre "falas com o termo" e "falas com a
 *      palavra" no arquivo todo). Palavras comuns ("de", "que") têm frequência alta e pontuação
 *      baixa; a tradução do termo ("mano") se concentra nas falas dele.
 * 3. Relata só os termos com ≥ 2 variantes.
 *
 * Linear no tamanho do texto; o passo 2 só percorre as falas de cada candidato.
 * Limitação: precisa de escrita com caixa (latina, cirílica, grega) na origem, e uma variante
 * precisa aparecer em ≥ 2 falas para não ser confundida com ruído.
 */

export interface TermConsistencyOptions {
  /** Falas mínimas com o termo capitalizado. */
  readonly minCues?: number
  /** Variantes no máximo por termo (inclui a mantida). */
  readonly maxVariants?: number
  /** Termos no máximo no relatório. */
  readonly maxTerms?: number
  /** Glossário do preset, para indicar termos já fixados. */
  readonly glossary?: readonly GlossaryEntry[]
  /** Falas a ignorar (ficaram sem tradução). */
  readonly skipCueIds?: ReadonlySet<number>
}

export const TERM_CONSISTENCY_DEFAULTS = { minCues: 3, maxVariants: 4, maxTerms: 50 } as const

/** Fração máxima de ocorrências em minúsculas para ainda ser termo. */
const MAX_LOWER_RATIO = 0.25
/** Uma variante associada precisa aparecer em ≥ 2 falas e ter Dice ≥ isto. */
const MIN_VARIANT_CUES = 2
const MIN_DICE = 0.3
const MAX_EXAMPLES = 3
const MAX_EXCERPT = 120

/** Pronomes e interjeições que o inglês sempre capitaliza. */
const STOPWORDS = new Set(['i', "i'm", "i'll", "i've", "i'd", 'ok', 'okay'])

const WORD = /[\p{L}\p{N}](?:[\p{L}\p{N}'’-]*[\p{L}\p{N}])?/gu
const UPPER_START = /^\p{Lu}/u
const HAS_LOWER = /\p{Ll}/u
const POSSESSIVE = /['’]s$/iu
/** Pontuação de abertura entre o fim da frase anterior e a palavra. */
const OPENERS = new Set([
  ' ',
  '\t',
  '"',
  "'",
  '“',
  '‘',
  '«',
  '(',
  '[',
  '-',
  '–',
  '—',
  '¿',
  '¡',
  '♪'
])
const SENTENCE_END = new Set(['.', '!', '?', '…', ':'])

interface Analyzed {
  readonly cue: Cue<unknown>
  readonly source: string
  readonly translation: string
  /** Palavras da origem (minúsculas), para não contar como variante o que já estava lá. */
  readonly sourceWords: ReadonlySet<string>
  /** Palavras da tradução (minúsculas), inteiras e partes de hifenizadas. */
  readonly targetWords: ReadonlySet<string>
}

interface TermStats {
  readonly cues: Set<number>
  mid: number
  cap: number
  lower: number
  readonly surfaces: Map<string, number>
}

export function analyzeTermConsistency(
  source: SubtitleDocument<unknown>,
  translated: SubtitleDocument<unknown>,
  preset: { id: string; name: string },
  options: TermConsistencyOptions = {}
): TermConsistencyReport {
  const minCues = options.minCues ?? TERM_CONSISTENCY_DEFAULTS.minCues
  const maxVariants = options.maxVariants ?? TERM_CONSISTENCY_DEFAULTS.maxVariants
  const maxTerms = options.maxTerms ?? TERM_CONSISTENCY_DEFAULTS.maxTerms

  const targetById = new Map<number, Cue<unknown>>()
  for (const item of translated.items) if (item.kind === 'cue') targetById.set(item.id, item)

  const analyzed = new Map<number, Analyzed>()
  const stats = new Map<string, TermStats>()
  /** Em quantas falas traduzidas cada palavra aparece. */
  const df = new Map<string, number>()
  /** Grafias de cada palavra na tradução (peso maior no meio da frase), para mostrar a usual. */
  const targetSurfaces = new Map<string, Map<string, number>>()

  for (const item of source.items) {
    if (item.kind !== 'cue' || options.skipCueIds?.has(item.id)) continue
    const target = targetById.get(item.id)
    if (!target) continue
    const src = cuePlainText(item)
    const tgt = cuePlainText(target)
    // Igual à origem: não traduzível (karaokê, letreiro) ou falhou; não diz nada sobre o termo.
    if (normalizeForHash(src) === normalizeForHash(tgt)) continue

    const sourceWords = new Set<string>()
    // Letreiro todo em maiúsculas: a caixa não distingue nomes.
    const casedLine = HAS_LOWER.test(src)
    for (const m of src.matchAll(WORD)) {
      const word = m[0].replace(POSSESSIVE, '')
      const key = word.toLowerCase()
      sourceWords.add(key)
      if (!casedLine || key.length < 2 || STOPWORDS.has(key) || !/\p{L}/u.test(key)) continue
      const s = stats.get(key) ?? newStats()
      stats.set(key, s)
      if (UPPER_START.test(word)) {
        s.cap++
        s.cues.add(item.id)
        s.surfaces.set(word, (s.surfaces.get(word) ?? 0) + 1)
        if (!sentenceStart(src, m.index)) s.mid++
      } else s.lower++
    }

    const targetWords = new Set<string>()
    for (const m of tgt.matchAll(WORD)) {
      const key = m[0].toLowerCase()
      const parts = key.includes('-') ? [key, ...key.split('-')] : [key]
      for (const p of parts) targetWords.add(p)
      // Início de frase só desempata: a grafia sugerida é a do meio da frase ("mano", não "Mano").
      const weight = sentenceStart(tgt, m.index) ? 1 : 1000
      const surfaces = targetSurfaces.get(key) ?? new Map<string, number>()
      targetSurfaces.set(key, surfaces)
      surfaces.set(m[0], (surfaces.get(m[0]) ?? 0) + weight)
    }
    for (const w of targetWords) df.set(w, (df.get(w) ?? 0) + 1)
    analyzed.set(item.id, { cue: item, source: src, translation: tgt, sourceWords, targetWords })
  }

  const candidates = [...stats.entries()].filter(
    ([, s]) => s.cues.size >= minCues && s.mid > 0 && s.lower <= MAX_LOWER_RATIO * (s.cap + s.lower)
  )

  const glossary = new Map(
    (options.glossary ?? []).flatMap((e) =>
      e.target ? [[e.source.trim().toLowerCase(), e.target] as const] : []
    )
  )

  const terms: TermVariation[] = []
  for (const [key, s] of candidates) {
    const cues = [...s.cues].map((id) => analyzed.get(id)!)
    const renderings = findRenderings(key, cues, df, maxVariants)
    if (renderings.length < 2) continue

    let unmatched = 0
    const byRendering = new Map<string, Analyzed[]>(renderings.map((r) => [r, []]))
    for (const a of cues) {
      let matched = false
      for (const r of renderings)
        if (containsFamily(a.targetWords, r)) {
          byRendering.get(r)!.push(a)
          matched = true
        }
      if (!matched) unmatched++
    }
    const variants: TermVariant[] = renderings
      .map((r) => {
        const list = byRendering.get(r)!
        return {
          text: mostFrequent(targetSurfaces.get(r)) ?? r,
          cues: list.length,
          kept: r === key,
          examples: list.slice(0, MAX_EXAMPLES).map(occurrence)
        }
      })
      .sort((a, b) => b.cues - a.cues || Number(b.kept) - Number(a.kept))
    const glossaryTarget = glossary.get(key)
    terms.push({
      term: mostFrequent(s.surfaces) ?? key,
      cues: cues.length,
      variants,
      unmatched,
      ...(glossaryTarget ? { glossaryTarget } : {})
    })
  }

  terms.sort((a, b) => b.cues - a.cues || a.term.localeCompare(b.term))
  return {
    analyzedCues: analyzed.size,
    candidates: candidates.length,
    terms: terms.slice(0, maxTerms),
    preset: { id: preset.id, name: preset.name }
  }
}

/** Mantido (se aparecer) + associadas gulosas sobre as falas ainda não cobertas. */
function findRenderings(
  key: string,
  cues: readonly Analyzed[],
  df: ReadonlyMap<string, number>,
  maxVariants: number
): string[] {
  const renderings: string[] = []
  let uncovered = cues
  const cover = (r: string): void => {
    renderings.push(r)
    uncovered = uncovered.filter((a) => !containsFamily(a.targetWords, r))
  }
  if (cues.some((a) => containsFamily(a.targetWords, key))) cover(key)

  while (renderings.length < maxVariants && uncovered.length >= MIN_VARIANT_CUES) {
    const counts = new Map<string, number>()
    for (const a of uncovered)
      for (const w of a.targetWords) {
        if (w.length < 2 || a.sourceWords.has(w) || !/\p{L}/u.test(w)) continue
        counts.set(w, (counts.get(w) ?? 0) + 1)
      }
    let best: { word: string; score: number; count: number } | null = null
    for (const [word, count] of counts) {
      if (count < MIN_VARIANT_CUES) continue
      if (renderings.some((r) => sameFamily(r, word))) continue
      const score = (2 * count) / (uncovered.length + (df.get(word) ?? count))
      if (score < MIN_DICE) continue
      if (
        !best ||
        score > best.score ||
        (score === best.score && (count > best.count || (count === best.count && word < best.word)))
      )
        best = { word, score, count }
    }
    if (!best) break
    cover(best.word)
  }
  return renderings
}

/** Mesma palavra ou flexão curta ("mano"/"manos", "Bro"/"Bros"). */
function sameFamily(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 3 && long.length - short.length <= 2 && long.startsWith(short)
}

function containsFamily(words: ReadonlySet<string>, r: string): boolean {
  if (words.has(r)) return true
  for (const w of words) if (sameFamily(r, w)) return true
  return false
}

/** Início do texto ou depois de ".", "!", "?", "…" (ignorando aspas, travessões e espaços). */
function sentenceStart(text: string, index: number): boolean {
  let i = index - 1
  while (i >= 0 && OPENERS.has(text[i])) i--
  return i < 0 || SENTENCE_END.has(text[i])
}

function newStats(): TermStats {
  return { cues: new Set(), mid: 0, cap: 0, lower: 0, surfaces: new Map() }
}

function mostFrequent(m: ReadonlyMap<string, number> | undefined): string | undefined {
  let best: [string, number] | undefined
  for (const e of m ?? []) if (!best || e[1] > best[1]) best = e
  return best?.[0]
}

function occurrence(a: Analyzed): TermOccurrence {
  return {
    cueId: a.cue.id,
    line: a.cue.line,
    startMs: a.cue.start.ms,
    source: excerpt(a.source),
    translation: excerpt(a.translation)
  }
}

function excerpt(s: string): string {
  const t = s.replace(/\s+/gu, ' ').trim()
  return t.length > MAX_EXCERPT ? `${t.slice(0, MAX_EXCERPT - 1)}…` : t
}

/** Uma linha para o log do job: "term consistency: 2 of 14 terms vary — Bro: mano ×40, Bro ×6; …". */
export function describeVariations(r: TermConsistencyReport, max = 10): string {
  const head = `term consistency: ${r.terms.length} of ${r.candidates} recurring terms vary (${r.analyzedCues} lines compared)`
  if (!r.terms.length) return head
  const list = r.terms
    .slice(0, max)
    .map((t) => `${t.term}: ${t.variants.map((v) => `${v.text} ×${v.cues}`).join(', ')}`)
  return `${head} — ${list.join('; ')}${r.terms.length > max ? '; …' : ''}`
}
