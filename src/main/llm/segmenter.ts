import type { HashedUnit } from '../memory/context-hash'
import { planChunks, type ChunkLimits } from './chunker'
import { estimateTokens } from './token-estimate'

/** Uma lane precisa de pelo menos isto de chunks: com 1, nenhum chunk teria `before` traduzido. */
export const MIN_CHUNKS_PER_LANE = 2
/** Janela de busca do corte, como fração do tamanho ideal de um segmento (±). */
export const CUT_WINDOW = 0.25
/** Peso de cada linha em cache logo antes do corte: vale como 10 s de silêncio. */
export const CACHED_LINE_BONUS_MS = 10_000
/** Linhas em cache além disto não melhoram o corte (é o tamanho do `before`). */
const CACHED_LINES_CAP = 5

/** Uma lane: chunks em ordem de tempo, traduzidos em sequência. */
export type Lane = HashedUnit[][]

export interface LanePlanOptions {
  /** Teto de lanes (setting `llm.concurrency.perJob`). */
  readonly maxLanes: number
  readonly limits: ChunkLimits
}

/**
 * Divide os misses em lanes contíguas para tradução paralela. Cada lane é sequencial por dentro
 * (o `before` de cada chunk leva as traduções do anterior); só a cabeça de cada lane pode ficar
 * sem `before` traduzido. Os cortes ficam onde isso menos importa:
 *
 * 1. `K = min(maxLanes, floor(chunks / 2))`, no mínimo 1.
 * 2. Só cortes "livres": os que não aumentam o total de chunks em relação ao plano sequencial.
 *    Cada chunk a mais repete System Prompt + contexto, então custaria mais.
 * 3. O corte ideal divide os tokens estimados em K partes iguais. Na janela de ±25% de um
 *    segmento em volta dele, vence o maior `gap` (início da linha − fim da anterior), somado
 *    a 10 s por linha em cache logo antes do corte: com cache, o `before` já sai traduzido.
 *    Empate: o mais perto do ideal.
 * 4. Sem corte livre na janela: o livre mais perto do ideal (fronteiras do plano guloso sempre
 *    são livres). Cada segmento é então chunkado por `planChunks`.
 *
 * Sem folga (ex.: 400 linhas, chunks de 40), os cortes livres são só as fronteiras de chunk e
 * as lanes podem sair desiguais: o custo vale mais que o balanceamento.
 */
export function planLanes(misses: readonly HashedUnit[], o: LanePlanOptions): Lane[] {
  const ordered = [...misses].sort((a, b) => a.timeIndex - b.timeIndex)
  if (ordered.length === 0) return []
  const tokens = ordered.map((u) => estimateTokens(u.unit.payload))
  const count = (from: number, to: number): number => countChunks(tokens, from, to, o.limits)
  const n = ordered.length
  const k = Math.max(
    1,
    Math.min(Math.floor(o.maxLanes), Math.floor(count(0, n) / MIN_CHUNKS_PER_LANE))
  )
  if (k === 1) return [planChunks(ordered, o.limits)]

  // `cum[i]` = peso antes da linha i (mínimo 1 por linha, para linhas vazias contarem).
  const cum = [0]
  for (const t of tokens) cum.push(cum[cum.length - 1] + Math.max(1, t))
  const segment = cum[n] / k

  const cuts: number[] = []
  let prev = 0
  for (let j = 1; j < k; j++) {
    const ideal = segment * j
    // Corte em `i` = nova lane começa na linha i. Deixa ao menos 1 linha para cada lane restante.
    const lo = prev + 1
    const hi = n - (k - j)
    const rest = count(prev, n)
    const free = (i: number): boolean => count(prev, i) + count(i, n) === rest
    const dist = (i: number): number => Math.abs(cum[i] - ideal)

    let best = -1
    let bestScore = -Infinity
    for (let i = lo; i <= hi; i++) {
      if (dist(i) > segment * CUT_WINDOW) continue
      if (!free(i)) continue
      const score = cutScore(ordered[i - 1], ordered[i])
      if (score > bestScore || (score === bestScore && dist(i) < dist(best))) {
        best = i
        bestScore = score
      }
    }
    if (best === -1) best = nearestFree(lo, hi, closest(cum, ideal, lo, hi), free)
    // Nenhum corte livre que deixe linhas para as lanes restantes: menos lanes.
    if (best === -1) break
    cuts.push(best)
    prev = best
  }

  const lanes: Lane[] = []
  let start = 0
  for (const cut of [...cuts, n]) {
    lanes.push(planChunks(ordered.slice(start, cut), o.limits))
    start = cut
  }
  return lanes
}

/**
 * Quantos chunks `planChunks` faria com as linhas `[from, to)`, sem montar os arrays. Mesma
 * regra: fecha ao atingir `maxLines` ou quando a próxima linha estouraria `maxTokens`.
 */
export function countChunks(
  tokens: readonly number[],
  from: number,
  to: number,
  limits: ChunkLimits
): number {
  let chunks = 0
  let lines = 0
  let sum = 0
  for (let i = from; i < to; i++) {
    if (lines > 0 && (lines >= limits.maxLines || sum + tokens[i] > limits.maxTokens)) {
      chunks++
      lines = 0
      sum = 0
    }
    lines++
    sum += tokens[i]
  }
  return lines > 0 ? chunks + 1 : chunks
}

function cutScore(before: HashedUnit, head: HashedUnit): number {
  const gap = head.startMs - before.endMs
  const cached = Math.min(CACHED_LINES_CAP, head.timeIndex - before.timeIndex - 1)
  return gap + cached * CACHED_LINE_BONUS_MS
}

function closest(cum: readonly number[], ideal: number, lo: number, hi: number): number {
  let best = lo
  for (let i = lo; i <= hi; i++)
    if (Math.abs(cum[i] - ideal) < Math.abs(cum[best] - ideal)) best = i
  return best
}

/** Do `center` para fora, o primeiro corte livre (lado esquerdo primeiro no empate). */
function nearestFree(lo: number, hi: number, center: number, free: (i: number) => boolean): number {
  for (let d = 0; center - d >= lo || center + d <= hi; d++) {
    if (center - d >= lo && free(center - d)) return center - d
    if (center + d <= hi && free(center + d)) return center + d
  }
  return -1
}
