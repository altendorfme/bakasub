import { describe, expect, it } from 'vitest'
import { Redactor } from './redact'

describe('Redactor', () => {
  const r = new Redactor()

  it('masks OpenRouter keys, bearer tokens, JWTs and api_key query params', () => {
    expect(r.text('key sk-or-v1-0123456789abcdef0123 ok')).toBe('key sk-or-*** ok')
    expect(r.text('Authorization: Bearer abc.DEF-123_xyz')).toBe('Authorization: Bearer ***')
    expect(r.text('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl end')).toBe(
      'token eyJ*** end'
    )
    expect(r.text('GET /3/search?api_key=0123456789abcdef0123456789abcdef&q=x')).toBe(
      'GET /3/search?api_key=***&q=x'
    )
  })

  it('masks registered secrets verbatim, wherever they appear', () => {
    const s = new Redactor()
    s.add('0123456789abcdef0123456789abcdef')
    expect(s.text('tmdb said 0123456789abcdef0123456789abcdef is bad')).toBe('tmdb said *** is bad')
  })

  it('ignores secrets too short to be safe to match', () => {
    const s = new Redactor()
    s.add('abc')
    expect(s.text('abc def')).toBe('abc def')
  })

  it('walks errors and plain objects without mutating them', () => {
    const err = new Error('auth failed for sk-or-v1-aaaaaaaaaaaaaaaa')
    const out = r.value({ msg: 'x', nested: ['Bearer qqq'], err }) as {
      nested: string[]
      err: Error
    }
    expect(out.nested[0]).toBe('Bearer ***')
    expect(out.err.message).toBe('auth failed for sk-or-***')
    expect(out.err.stack).not.toContain('aaaaaaaaaaaaaaaa')
    expect(err.message).toContain('aaaaaaaaaaaaaaaa')
  })

  it('leaves numbers, booleans and null alone; survives cycles', () => {
    const cyc: Record<string, unknown> = { a: 1 }
    cyc.self = cyc
    expect(r.value(42)).toBe(42)
    expect(r.value(null)).toBeNull()
    expect(() => r.value(cyc)).not.toThrow()
  })
})
