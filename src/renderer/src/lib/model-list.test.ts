import { describe, expect, it } from 'vitest'
import type { ModelSummary } from '@shared/ipc-contract'
import {
  defaultModelListOptions,
  families,
  filterAndSortModels,
  inPriceRange,
  priceStops
} from './model-list'

const m = (id: string, over: Partial<ModelSummary> = {}): ModelSummary => ({
  id,
  name: id,
  contextLength: 100_000,
  maxCompletionTokens: null,
  isModerated: false,
  pricing: { prompt: 1e-6, completion: 1e-6 },
  structuredOutputs: false,
  responseFormat: true,
  ...over
})

const list = [
  m('google/a', {
    pricing: { prompt: 3e-7, completion: 2.5e-6 },
    contextLength: 1_000_000,
    structuredOutputs: true
  }),
  m('anthropic/b', { pricing: { prompt: 3e-6, completion: 1.5e-5 }, isModerated: true }),
  m('meta/c:free', { pricing: { prompt: 0, completion: 0 }, contextLength: 8_000 }),
  m('openrouter/auto', { pricing: null })
]
const ids = (xs: ModelSummary[]): string[] => xs.map((x) => x.id)
const o = defaultModelListOptions

describe('filterAndSortModels', () => {
  it('sorts by price (dynamic last) and by context', () => {
    expect(ids(filterAndSortModels(list, { ...o, sort: 'price-asc' }, []))).toEqual([
      'meta/c:free',
      'google/a',
      'anthropic/b',
      'openrouter/auto'
    ])
    expect(ids(filterAndSortModels(list, { ...o, sort: 'price-desc' }, []))[0]).toBe('anthropic/b')
    expect(ids(filterAndSortModels(list, { ...o, sort: 'context-desc' }, []))[0]).toBe('google/a')
  })

  it('filters by family, free, reliable JSON and moderation', () => {
    expect(ids(filterAndSortModels(list, { ...o, family: 'google' }, []))).toEqual(['google/a'])
    expect(ids(filterAndSortModels(list, { ...o, freeOnly: true }, []))).toEqual(['meta/c:free'])
    expect(ids(filterAndSortModels(list, { ...o, jsonOnly: true }, []))).toEqual(['google/a'])
    expect(ids(filterAndSortModels(list, { ...o, hideModerated: true }, []))).not.toContain(
      'anthropic/b'
    )
  })

  it('favorites stay first, in the chosen order', () => {
    expect(ids(filterAndSortModels(list, { ...o, sort: 'price-asc' }, ['anthropic/b']))[0]).toBe(
      'anthropic/b'
    )
    expect(families(list)).toEqual(['anthropic', 'google', 'meta', 'openrouter'])
  })
})

describe('price range', () => {
  it('both input and output prices must fit; any bound hides dynamic prices', () => {
    // google/a: 0.3 in, 2.5 out
    expect(inPriceRange(list[0], 0, 3)).toBe(true)
    expect(inPriceRange(list[0], 0, 1)).toBe(false)
    expect(inPriceRange(list[0], 0.5, null)).toBe(false)
    expect(inPriceRange(list[3], null, null)).toBe(true)
    expect(inPriceRange(list[3], 0, null)).toBe(false)
    expect(ids(filterAndSortModels(list, { ...o, priceMin: 0, priceMax: 0 }, []))).toEqual([
      'meta/c:free'
    ])
  })
  it('stops go up to the most expensive model', () => {
    expect(priceStops(list)).toEqual([0, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15])
    expect(priceStops([])).toEqual([0, 0.05])
  })
})
