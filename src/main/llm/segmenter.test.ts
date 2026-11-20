import { describe, expect, it } from 'vitest'
import type { HashedUnit } from '../memory/context-hash'
import { planChunks, type ChunkLimits } from './chunker'
import { countChunks, planLanes } from './segmenter'
import { estimateTokens } from './token-estimate'

const LIMITS: ChunkLimits = { maxLines: 40, maxTokens: 2000 }

/** Falas de 1,5 s a cada 2 s; `gaps` = índices seguidos de 30 s de silêncio. */
function units(
  n: number,
  o: {
    gaps?: readonly number[]
    payload?: (i: number) => string
    skip?: (i: number) => boolean
  } = {}
): HashedUnit[] {
  const out: HashedUnit[] = []
  let t = 0
  for (let i = 0; i < n; i++) {
    const payload = o.payload?.(i) ?? `Line ${i}`
    if (!o.skip?.(i))
      out.push({
        cueId: i + 1,
        hash: `h${i}`,
        contextUsed: false,
        timeIndex: i,
        startMs: t,
        endMs: t + 1500,
        plain: payload,
        unit: {
          cueId: i + 1,
          payload,
          skeleton: { head: [], tail: [], markers: {}, brs: [], inline: [] }
        }
      })
    t += 2000 + (o.gaps?.includes(i) ? 30_000 : 0)
  }
  return out
}

const heads = (lanes: HashedUnit[][][]): number[] => lanes.map((l) => l[0][0].timeIndex)
const chunkTotal = (lanes: HashedUnit[][][]): number => lanes.reduce((n, l) => n + l.length, 0)

describe('countChunks', () => {
  it('bate com planChunks (linhas, orçamento de tokens, linha maior que o orçamento)', () => {
    const payloads = Array.from({ length: 300 }, (_, i) => 'x'.repeat(((i * 7919) % 97) * 9 + 1))
    const us = units(300, { payload: (i) => payloads[i] })
    const tokens = us.map((u) => estimateTokens(u.unit.payload))
    for (const limits of [LIMITS, { maxLines: 7, maxTokens: 150 }, { maxLines: 40, maxTokens: 30 }])
      for (const [from, to] of [
        [0, 300],
        [13, 211],
        [100, 101],
        [50, 50]
      ])
        expect(countChunks(tokens, from, to, limits)).toBe(
          planChunks(us.slice(from, to), limits).length
        )
  })
})

describe('planLanes', () => {
  it('poucos chunks: uma lane só (mínimo de 2 chunks por lane)', () => {
    expect(planLanes(units(79), { maxLanes: 4, limits: LIMITS })).toHaveLength(1)
    expect(planLanes(units(120), { maxLanes: 4, limits: LIMITS })).toHaveLength(1)
    expect(planLanes(units(160), { maxLanes: 4, limits: LIMITS })).toHaveLength(2)
    expect(planLanes([], { maxLanes: 4, limits: LIMITS })).toEqual([])
  })

  it('perJob 1: exatamente o plano sequencial', () => {
    const us = units(400)
    expect(planLanes(us, { maxLanes: 1, limits: LIMITS })).toEqual([planChunks(us, LIMITS)])
  })

  it('nunca aumenta o total de chunks (custo igual ao sequencial)', () => {
    for (const n of [160, 199, 400, 413, 777]) {
      const us = units(n, { gaps: [37, 101, 250, 333, 600] })
      const lanes = planLanes(us, { maxLanes: 4, limits: LIMITS })
      expect(chunkTotal(lanes)).toBe(planChunks(us, LIMITS).length)
      expect(lanes.flat(2).map((u) => u.cueId)).toEqual(us.map((u) => u.cueId))
    }
  })

  it('com folga, corta no maior silêncio da janela', () => {
    // 150 linhas = 4 chunks; cortes livres 70..80; ideal 75; silêncio depois do 72.
    const lanes = planLanes(units(150, { gaps: [72] }), { maxLanes: 2, limits: LIMITS })
    expect(heads(lanes)).toEqual([0, 73])
  })

  it('silêncio fora da janela não puxa o corte', () => {
    const lanes = planLanes(units(150, { gaps: [10] }), { maxLanes: 2, limits: LIMITS })
    expect(heads(lanes)[1]).toBeGreaterThanOrEqual(70)
    expect(heads(lanes)[1]).toBeLessThanOrEqual(80)
  })

  it('linhas em cache logo antes do corte valem como silêncio (o before já sai traduzido)', () => {
    // Índices 74..76 em cache (não são misses): cortar no 77 dá 3 linhas traduzidas de contexto.
    const us = units(153, { skip: (i) => i >= 74 && i <= 76 })
    const lanes = planLanes(us, { maxLanes: 2, limits: LIMITS })
    expect(heads(lanes)).toEqual([0, 77])
  })

  it('arquivo grande: rápido o bastante para o main thread', () => {
    const us = units(5000, { gaps: [900, 2100, 3700] })
    const t0 = performance.now()
    const lanes = planLanes(us, { maxLanes: 8, limits: LIMITS })
    expect(performance.now() - t0).toBeLessThan(200)
    expect(lanes).toHaveLength(8)
  })
})
