import { describe, expect, it } from 'vitest'
import type { ModelInfo } from '../llm/model-catalog'
import { computeContextHashes } from '../memory/context-hash'
import type { DocumentLookup } from '../memory/job-memory.service'
import { assFormat } from '../parsers/ass'
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
const allMisses = (): DocumentLookup => ({
  hits: new Map(),
  misses: computeContextHashes(doc),
  copies: new Map()
})
const base = {
  doc,
  preset: { glossary: [] as unknown[], prompt: '' },
  targetLang: 'pt-BR',
  catalogFetchedAt: 0
}

describe('estimatePreflight', () => {
  it('tudo miss: linhas, chunks, tokens e custo exatos para GPT (faixa só dos retries)', () => {
    const e = estimatePreflight({ ...base, model: GPT, lookup: allMisses() })
    expect(e.lines).toEqual({ total: 50, cached: 0, toTranslate: 50, copies: 0, chunks: 2 })
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
    const e = estimatePreflight({
      ...base,
      model: GPT,
      lookup: { hits, misses: all.slice(45), copies: new Map() }
    })
    const full = estimatePreflight({ ...base, model: GPT, lookup: allMisses() })
    expect(e.lines).toEqual({ total: 50, cached: 45, toTranslate: 5, copies: 0, chunks: 1 })
    expect(e.tokens.input.low).toBeLessThan(full.tokens.input.low)
  })

  it('cópias contam no total mas não viram requisição nem token', () => {
    const all = computeContextHashes(doc)
    const copies = new Map([[all[0].cueId, all.slice(40)]])
    const e = estimatePreflight({
      ...base,
      model: GPT,
      lookup: { hits: new Map(), misses: all.slice(0, 40), copies }
    })
    const only40 = estimatePreflight({
      ...base,
      model: GPT,
      lookup: { hits: new Map(), misses: all.slice(0, 40), copies: new Map() }
    })
    expect(e.lines).toEqual({ total: 50, cached: 0, toTranslate: 40, copies: 10, chunks: 1 })
    expect(e.tokens).toEqual(only40.tokens)
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
      preset: {
        glossary: [{ source: 'senpai', rule: 'keep Japanese honorifics as they are' }],
        prompt: ''
      },
      model: GPT,
      lookup: allMisses()
    })
    expect(withGlossary.tokens.input.low).toBeGreaterThan(plain.tokens.input.low + 2 * 8)
  })

  it('nada a traduzir: zero', () => {
    const all = computeContextHashes(doc)
    const hits = new Map(all.map((u) => [u.cueId, { translated: u.unit.payload, unit: u }]))
    const e = estimatePreflight({
      ...base,
      model: GPT,
      lookup: { hits, misses: [], copies: new Map() }
    })
    expect(e.lines.chunks).toBe(0)
    expect(e.tokens).toEqual({ input: { low: 0, high: 0 }, output: { low: 0, high: 0 } })
    expect(e.cost).toEqual({ low: 0, high: 0 })
  })

  it('speaker (Name do ASS) entra na conta de entrada; a saída não muda', () => {
    const ass = (name: string): ReturnType<typeof assFormat.parse> =>
      assFormat.parse(
        `[Events]\n${Array.from(
          { length: 20 },
          (_, i) =>
            `Dialogue: 0,0:00:${String(i).padStart(2, '0')}.00,0:00:59.00,Default,${name},0,0,0,,Sentence number ${i} here.`
        ).join('\n')}\n`
      )
    const run = (name: string): ReturnType<typeof estimatePreflight> => {
      const d = ass(name)
      return estimatePreflight({
        ...base,
        doc: d,
        model: GPT,
        lookup: { hits: new Map(), misses: computeContextHashes(d), copies: new Map() }
      })
    }
    const without = run('')
    const generic = run('Default')
    const named = run('Kamina')
    expect(generic.tokens).toEqual(without.tokens)
    expect(named.tokens.input.low).toBeGreaterThan(without.tokens.input.low)
    expect(named.tokens.output).toEqual(without.tokens.output)
  })
})
