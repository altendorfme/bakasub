import { describe, expect, it } from 'vitest'
import { cuePlainText } from './plain-text'
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
