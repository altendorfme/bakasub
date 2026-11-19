import { describe, expect, it } from 'vitest'
import type { HashedUnit } from '../memory/context-hash'
import { buildContext, planChunks } from './chunker'
import { estimateTokens } from './token-estimate'

const unit = (cueId: number, payload: string, timeIndex = cueId - 1): HashedUnit => ({
  cueId,
  hash: `h${cueId}`,
  contextUsed: false,
  timeIndex,
  plain: payload.replace(/<[^>]+>/g, ''),
  unit: { cueId, payload, skeleton: { head: [], tail: [], markers: {}, brs: [] } }
})

describe('estimateTokens', () => {
  it('~4 caracteres por token em escrita latina; CJK ~1 por caractere', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('日本語です')).toBe(5)
    expect(estimateTokens('')).toBe(0)
  })
})

describe('planChunks', () => {
  it('ordena por timeIndex e respeita o limite de linhas', () => {
    const misses = Array.from({ length: 90 }, (_, i) => unit(i + 1, 'Oi', 89 - i))
    const chunks = planChunks(misses, { maxLines: 40, maxTokens: 10_000 })
    expect(chunks.map((c) => c.length)).toEqual([40, 40, 10])
    expect(chunks[0][0].cueId).toBe(90)
  })
  it('respeita o orçamento de tokens; linha maior que o orçamento vai sozinha', () => {
    const big = 'x'.repeat(4000) // ~1000 tokens
    const misses = [unit(1, big), unit(2, big), unit(3, 'x'.repeat(40_000)), unit(4, 'a')]
    const chunks = planChunks(misses, { maxLines: 40, maxTokens: 2000 })
    expect(chunks.map((c) => c.map((u) => u.cueId))).toEqual([[1, 2], [3], [4]])
  })
  it('vazio => nenhum chunk', () => {
    expect(planChunks([], { maxLines: 40, maxTokens: 2000 })).toEqual([])
  })
})

describe('buildContext', () => {
  const timeline = Array.from({ length: 12 }, (_, i) => unit(i + 1, `linha ${i + 1}`))
  it('5 antes (com tradução conhecida) e 2 depois (só origem), fora do chunk', () => {
    const chunk = [timeline[6], timeline[7]] // cues 7 e 8
    const known = new Map([
      [3, 'line <g1>3</g1>'],
      [6, 'line 6<br/>end']
    ])
    const ctx = buildContext(timeline, chunk, known, { before: 5, after: 2 })
    expect(ctx.before).toEqual([
      { cueId: 2, source: 'linha 2' },
      { cueId: 3, source: 'linha 3', translation: 'line 3' },
      { cueId: 4, source: 'linha 4' },
      { cueId: 5, source: 'linha 5' },
      { cueId: 6, source: 'linha 6', translation: 'line 6 end' }
    ])
    expect(ctx.after).toEqual([
      { cueId: 9, source: 'linha 9' },
      { cueId: 10, source: 'linha 10' }
    ])
  })
  it('bordas da linha do tempo', () => {
    const ctx = buildContext(timeline, [timeline[0]], new Map(), { before: 5, after: 2 })
    expect(ctx.before).toEqual([])
    expect(ctx.after.map((c) => c.cueId)).toEqual([2, 3])
  })
  it('chunk não contíguo (hits no meio): vizinhos do meio não entram, só antes/depois', () => {
    const ctx = buildContext(timeline, [timeline[3], timeline[5]], new Map(), {
      before: 1,
      after: 1
    })
    expect(ctx.before.map((c) => c.cueId)).toEqual([3])
    expect(ctx.after.map((c) => c.cueId)).toEqual([7])
  })
})
