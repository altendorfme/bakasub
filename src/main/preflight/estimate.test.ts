import { describe, expect, it } from 'vitest'
import type { ModelInfo } from '../llm/model-catalog'
import { computeContextHashes } from '../memory/context-hash'
import type { DocumentLookup } from '../memory/job-memory.service'
import { srtFormat } from '../parsers/srt'
import { estimatePreflight } from './estimate'

const GPT: ModelInfo = {
  id: 'openai/gpt-x',
  name: 'GPT',
  contextLength: 100000,
  maxCompletionTokens: 8000,
  isModerated: false,
  pricing: { prompt: 0.000001, completion: 0.000004 },
  structuredOutputs: true,
  responseFormat: true,
  tokenizer: 'GPT'
}
const doc = srtFormat.parse(
  Array.from(
    { length: 50 },
    (_, i) =>
      `${i + 1}\n00:00:${String(i).padStart(2, '0')},000 --> 00:00:${String(i).padStart(2, '0')},500\nSentence number ${i} is <i>here</i>.\n`
  ).join('\n')
)
const allMisses = (): DocumentLookup => ({ hits: new Map(), misses: computeContextHashes(doc) })
const base = {
  doc,
  profile: { glossary: [] as unknown[] },
  targetLang: 'pt-BR',
  catalogFetchedAt: 0
}

describe('estimatePreflight', () => {
  it('tudo miss: linhas, chunks, tokens e custo exatos para GPT (faixa só dos retries)', () => {
    const e = estimatePreflight({ ...base, model: GPT, lookup: allMisses() })
    expect(e.lines).toEqual({ total: 50, cached: 0, toTranslate: 50, chunks: 2 })
    expect(e.approximate).toBe(false)
    expect(e.tokens.input.low).toBeGreaterThan(500)
    expect(e.tokens.input.high).toBe(Math.ceil(e.tokens.input.low * 1.15))
    expect(e.cost!.low).toBeCloseTo(
      e.tokens.input.low * 0.000001 + e.tokens.output.low * 0.000004,
      12
    )
    expect(e.cost!.high).toBeGreaterThan(e.cost!.low)
    expect(e.model).toEqual({
      id: GPT.id,
      pricing: GPT.pricing,
      catalogFetchedAt: new Date(0).toISOString()
    })
  })

  it('hits do cache reduzem as linhas e os tokens', () => {
    const all = computeContextHashes(doc)
    const hits = new Map(
      all.slice(0, 45).map((u) => [u.cueId, { translated: `PT ${u.unit.payload}`, unit: u }])
    )
    const e = estimatePreflight({ ...base, model: GPT, lookup: { hits, misses: all.slice(45) } })
    const full = estimatePreflight({ ...base, model: GPT, lookup: allMisses() })
    expect(e.lines).toEqual({ total: 50, cached: 45, toTranslate: 5, chunks: 1 })
    expect(e.tokens.input.low).toBeLessThan(full.tokens.input.low)
  })

  it('tokenizer de outra família: aproximado, faixa ±20% além dos retries', () => {
    const exact = estimatePreflight({ ...base, model: GPT, lookup: allMisses() })
    const e = estimatePreflight({
      ...base,
      model: { ...GPT, tokenizer: 'Claude' },
      lookup: allMisses()
    })
    expect(e.approximate).toBe(true)
    expect(e.tokens.input.low).toBe(Math.floor(exact.tokens.input.low * 0.8))
    expect(e.tokens.input.high).toBe(Math.ceil(exact.tokens.input.low * 1.15 * 1.2))
  })

  it('preço dinâmico: tokens sem custo', () => {
    const e = estimatePreflight({ ...base, model: { ...GPT, pricing: null }, lookup: allMisses() })
    expect(e.cost).toBeNull()
    expect(e.tokens.output.low).toBeGreaterThan(0)
  })

  it('glossário entra no System Prompt de cada chunk', () => {
    const plain = estimatePreflight({ ...base, model: GPT, lookup: allMisses() })
    const withGlossary = estimatePreflight({
      ...base,
      profile: { glossary: [{ source: 'senpai', rule: 'keep Japanese honorifics as they are' }] },
      model: GPT,
      lookup: allMisses()
    })
    expect(withGlossary.tokens.input.low).toBeGreaterThan(plain.tokens.input.low + 2 * 8)
  })

  it('nada a traduzir: zero', () => {
    const all = computeContextHashes(doc)
    const hits = new Map(all.map((u) => [u.cueId, { translated: u.unit.payload, unit: u }]))
    const e = estimatePreflight({ ...base, model: GPT, lookup: { hits, misses: [] } })
    expect(e.lines.chunks).toBe(0)
    expect(e.tokens).toEqual({ input: { low: 0, high: 0 }, output: { low: 0, high: 0 } })
    expect(e.cost).toEqual({ low: 0, high: 0 })
  })
})
