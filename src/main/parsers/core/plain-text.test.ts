import { describe, expect, it } from 'vitest'
import { cuePlainText, normalizeForHash } from './plain-text'
import type { Node } from './types'

const t = (value: string): Node => ({ type: 'text', value })
const open = (name: string): Node => ({ type: 'tag', raw: `<${name}>`, name, kind: 'open' })
const close = (name: string): Node => ({ type: 'tag', raw: `</${name}>`, name, kind: 'close' })
const br: Node = { type: 'br', raw: '\n' }

describe('cuePlainText', () => {
  it('descarta tags e junta o texto', () => {
    expect(cuePlainText({ nodes: [t('Olá '), open('i'), t('mundo'), close('i'), t('!')] })).toBe(
      'Olá mundo!'
    )
  })

  it('troca quebras de linha por espaço', () => {
    expect(cuePlainText({ nodes: [t('- Oi'), br, t('- Olá')] })).toBe('- Oi - Olá')
  })

  it('cue sem texto resulta em string vazia', () => {
    expect(cuePlainText({ nodes: [open('i'), close('i')] })).toBe('')
  })
})

describe('cuePlainText: ASS', () => {
  it('\\h (espaço rígido ASS) vira espaço', () => {
    expect(cuePlainText({ nodes: [t('Olá\\hmundo')] })).toBe('Olá mundo')
  })
})

describe('normalizeForHash', () => {
  it('NFC: formas compostas e decompostas são iguais', () => {
    expect(normalizeForHash('café')).toBe(normalizeForHash('café'))
    expect(normalizeForHash('café')).toBe('café')
  })
  it('\\h vira espaço, espaços (inclusive NBSP e tab) colapsam, trim', () => {
    expect(normalizeForHash('  Olá\\h\\h \tmundo  ')).toBe('Olá mundo')
  })
  it('preserva caixa e pontuação', () => {
    expect(normalizeForHash('OK.')).not.toBe(normalizeForHash('ok.'))
  })
  it('preserva marcadores do payload', () => {
    expect(normalizeForHash('Olá  <g1>mundo</g1> <br/> x')).toBe('Olá <g1>mundo</g1> <br/> x')
  })
  it('idempotente', () => {
    const s = ' a\\h b  c '
    expect(normalizeForHash(normalizeForHash(s))).toBe(normalizeForHash(s))
  })
})
