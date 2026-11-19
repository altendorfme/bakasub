import type { HashedUnit } from '../memory/context-hash'
import { estimateTokens } from './token-estimate'

export interface ChunkLimits {
  /** Padrão 40. */
  readonly maxLines: number
  /** Orçamento estimado do `<target>`. Padrão 2000. */
  readonly maxTokens: number
}

export const DEFAULT_CHUNK_LIMITS: ChunkLimits = { maxLines: 40, maxTokens: 2000 }
export const DEFAULT_CONTEXT_WINDOW = { before: 5, after: 2 } as const

/**
 * Agrupa os misses em chunks sequenciais, na ordem da linha do tempo. Guloso: fecha o chunk ao
 * atingir `maxLines` ou quando a próxima linha estouraria `maxTokens` (uma linha maior que o
 * orçamento vai sozinha).
 */
export function planChunks(misses: readonly HashedUnit[], limits: ChunkLimits): HashedUnit[][] {
  const ordered = [...misses].sort((a, b) => a.timeIndex - b.timeIndex)
  const chunks: HashedUnit[][] = []
  let current: HashedUnit[] = []
  let tokens = 0
  for (const u of ordered) {
    const t = estimateTokens(u.unit.payload)
    if (
      current.length > 0 &&
      (current.length >= limits.maxLines || tokens + t > limits.maxTokens)
    ) {
      chunks.push(current)
      current = []
      tokens = 0
    }
    current.push(u)
    tokens += t
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export interface ContextLine {
  readonly cueId: number
  /** Texto puro de origem (sem marcadores). */
  readonly source: string
  /** Texto puro da tradução já conhecida (cache ou chunk anterior). */
  readonly translation?: string
}

export interface ChunkContext {
  readonly before: readonly ContextLine[]
  readonly after: readonly ContextLine[]
}

/** Payload traduzido -> texto puro (marcadores removidos, `<br/>` como espaço). */
export function payloadPlain(payload: string): string {
  return payload
    .replace(/<br\/>/g, ' ')
    .replace(/<\/?g[1-9]\d*>|<x[1-9]\d*\/>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Vizinhos do chunk na linha do tempo dos traduzíveis: `before` cues antes do primeiro e
 * `after` depois do último, excluindo os próprios membros. Linhas anteriores levam a tradução
 * quando conhecida; as posteriores, só a origem.
 */
export function buildContext(
  timeline: readonly HashedUnit[],
  chunk: readonly HashedUnit[],
  known: ReadonlyMap<number, string>,
  window: { before: number; after: number }
): ChunkContext {
  const byTime = [...timeline].sort((a, b) => a.timeIndex - b.timeIndex)
  const members = new Set(chunk.map((u) => u.cueId))
  const first = Math.min(...chunk.map((u) => u.timeIndex))
  const last = Math.max(...chunk.map((u) => u.timeIndex))

  const before = byTime
    .filter((u) => u.timeIndex < first && !members.has(u.cueId))
    .slice(-window.before)
    .map((u): ContextLine => {
      const t = known.get(u.cueId)
      return t === undefined
        ? { cueId: u.cueId, source: u.plain }
        : { cueId: u.cueId, source: u.plain, translation: payloadPlain(t) }
    })
  const after = byTime
    .filter((u) => u.timeIndex > last && !members.has(u.cueId))
    .slice(0, window.after)
    .map((u): ContextLine => ({ cueId: u.cueId, source: u.plain }))
  return { before, after }
}
