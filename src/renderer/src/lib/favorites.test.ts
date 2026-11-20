import { describe, expect, it } from 'vitest'
import { makeDefault, pricePerMillion, toggleItem } from './favorites'

describe('list with default', () => {
  it('the first item added becomes the default', () => {
    expect(toggleItem({ list: [], default: null }, 'a')).toEqual({ list: ['a'], default: 'a' })
    expect(toggleItem({ list: ['a'], default: 'a' }, 'b')).toEqual({
      list: ['a', 'b'],
      default: 'a'
    })
  })
  it('removing the default promotes the next item, or clears it', () => {
    expect(toggleItem({ list: ['a', 'b'], default: 'a' }, 'a')).toEqual({
      list: ['b'],
      default: 'b'
    })
    expect(toggleItem({ list: ['a'], default: 'a' }, 'a')).toEqual({ list: [], default: null })
  })
  it('making an item the default adds it to the list', () => {
    expect(makeDefault({ list: ['a'], default: 'a' }, 'b')).toEqual({
      list: ['a', 'b'],
      default: 'b'
    })
  })
})

describe('pricePerMillion', () => {
  it('formats per-token prices per 1M tokens', () => {
    expect(pricePerMillion(0)).toBe('0')
    expect(pricePerMillion(0.00000015)).toBe('0.15')
    expect(pricePerMillion(0.0000025)).toBe('2.5')
    expect(pricePerMillion(0.000015)).toBe('15')
    expect(pricePerMillion(0.00000002)).toBe('0.02')
  })
})
