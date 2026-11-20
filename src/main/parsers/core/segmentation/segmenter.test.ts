import { describe, expect, it } from 'vitest'
import { srtFormat } from '../../srt'
import type { Cue } from '../types'
import { classify, toTranslationUnit } from './segmenter'

const T = '00:00:01,000 --> 00:00:02,000'
const cueOf = (body: string): Cue<unknown> =>
  srtFormat.parse(`1\n${T}\n${body}\n`).items[0] as Cue<unknown>
const payloadOf = (body: string): string | undefined => toTranslationUnit(cueOf(body))?.payload

describe('payload', () => {
  it('texto puro não ganha marcadores', () => {
    expect(payloadOf('Olá, mundo!')).toBe('Olá, mundo!')
  })

  it('tags de abrir/fechar viram <gN> e preservam o escopo', () => {
    expect(payloadOf('Olá <i>mundo</i>, tudo bem?')).toBe('Olá <g1>mundo</g1>, tudo bem?')
  })

  it('override ASS no início sai do payload (fica no esqueleto)', () => {
    const unit = toTranslationUnit(cueOf('{\\an8}Texto'))!
    expect(unit.payload).toBe('Texto')
    expect(unit.skeleton.head).toHaveLength(1)
    expect(unit.skeleton.tail).toHaveLength(0)
  })

  it('tag que envolve o cue inteiro sai do payload (par nas bordas)', () => {
    const unit = toTranslationUnit(cueOf('<i>Hello</i>'))!
    expect(unit.payload).toBe('Hello')
    expect(unit.skeleton.head).toHaveLength(1)
    expect(unit.skeleton.tail).toHaveLength(1)
  })

  it('tags por linha formam pares, não singles (a borda não separa pares)', () => {
    expect(payloadOf('<i>A</i>\n<i>B</i>')).toBe('<g1>A</g1><br/><g2>B</g2>')
  })

  it('override no meio vira <xN/>', () => {
    expect(payloadOf('Olá {\\i1}mundo{\\i0} fim')).toBe('Olá <x1/>mundo<x2/> fim')
  })

  it('override nas duas bordas e no meio', () => {
    const unit = toTranslationUnit(cueOf('{\\an8}Olá {\\i1}mundo{\\i0}'))!
    expect(unit.payload).toBe('Olá <x1/>mundo')
    expect(unit.skeleton.tail).toHaveLength(1)
  })

  it('tags sem par viram <xN/>', () => {
    expect(payloadOf('a <b>x</i> y')).toBe('a <x1/>x<x2/> y')
  })

  it('aninhamento cruzado: o fecho que não casa vira single', () => {
    expect(payloadOf('a <b>x <i>y</b> z</i>')).toBe('a <x1/>x <g2>y<x3/> z</g2>')
  })

  it('quebras de linha viram <br/>', () => {
    expect(payloadOf('- Oi\n- Olá')).toBe('- Oi<br/>- Olá')
  })

  it('texto com < > & e entidades segue cru, sem escape', () => {
    expect(payloadOf('a < b &amp; <3')).toBe('a < b &amp; <3')
  })
})

describe('classify: cues', () => {
  it.each(['♪♪', '...', '123', '<i>---</i>', '{\\an8}'])('sem letras é "skipped": %j', (body) => {
    expect(classify(cueOf(body))).toEqual({ status: 'skipped', reason: 'SKIPPED_NO_LETTERS' })
  })

  it('com letras em qualquer script é traduzível', () => {
    for (const body of ['Hello', '日本語', 'Привет', 'مرحبا', '♪ la la ♪']) {
      expect(classify(cueOf(body)).status).toBe('translatable')
    }
  })

  it.each(['<g1>', '</g2>', '<x3/>', '<br/>'])('colisão com marcador: %s', (marker) => {
    const c = classify(cueOf(`texto ${marker} aqui`))
    expect(c).toEqual({
      status: 'untranslated',
      reason: 'UNTRANSLATED_MARKER_COLLISION',
      params: { marker }
    })
    expect(toTranslationUnit(cueOf(`texto ${marker} aqui`))).toBeNull()
  })

  it.each(['<G1>', '<g01>', '< g1>', '<g>', '<x1>', '<br>'])(
    'quase-marcador não colide: %s',
    (s) => {
      expect(classify(cueOf(`texto ${s} aqui`)).status).toBe('translatable')
    }
  )
})

describe('classify: blocos não parseados', () => {
  const doc = srtFormat.parse(
    `1\n${T}\nA\n\norfão\n\n77\n\n2\n00:00:05,000 --> quebrado\nB\n\n3\n${T}\nC\n`
  )
  it('mapeia cada motivo', () => {
    const reasons = doc.items
      .map((i) => (i.kind === 'unparsed' ? classify(i) : null))
      .filter(Boolean)
    expect(reasons).toEqual([
      { status: 'untranslated', reason: 'UNTRANSLATED_ORPHAN_TEXT' },
      { status: 'skipped', reason: 'SKIPPED_EMPTY_BLOCK' },
      { status: 'untranslated', reason: 'UNTRANSLATED_BAD_TIMING' }
    ])
  })
})

describe('fragmentos de karaokê tipografado', () => {
  const status = (body: string): string => classify(cueOf(body)).status
  it('sílaba posicionada e animada é ignorada', () => {
    expect(classify(cueOf('{\\fscx100\\pos(1440.2,22.5)\\t(0,480,\\1c&HFFFFFF&)}shii'))).toEqual({
      status: 'skipped',
      reason: 'SKIPPED_FRAGMENT'
    })
  })
  it('letra única com \\move é ignorada', () => {
    expect(status('{\\move(1,2,3,4)}k')).toBe('skipped')
  })
  it('texto curto sem animação, frase e linha comum continuam traduzíveis', () => {
    expect(status('{\\pos(10,10)}Exit')).toBe('translatable')
    expect(status('{\\pos(10,10)\\t(0,1,\\fscx90)}Hi there')).toBe('translatable')
    expect(status('Yes')).toBe('translatable')
  })
})
