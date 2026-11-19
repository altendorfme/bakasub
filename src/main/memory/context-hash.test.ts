import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assFormat } from '../parsers/ass'
import { srtFormat } from '../parsers/srt'
import { computeContextHashes, countWords } from './context-hash'

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')
const ev = (start: string, text: string, style = 'Default'): string =>
  `Dialogue: 0,${start},0:00:59.00,${style},,0,0,0,,${text}`
const ass = (...lines: string[]): ReturnType<typeof assFormat.parse> =>
  assFormat.parse(`[Events]\n${lines.join('\n')}\n`)
const srt = (...texts: string[]): ReturnType<typeof srtFormat.parse> =>
  srtFormat.parse(
    texts.map((t, i) => `${i + 1}\n00:00:0${i},000 --> 00:00:0${i},500\n${t}\n`).join('\n')
  )

describe('countWords', () => {
  it('conta palavras, não pontuação', () => {
    expect(countWords('Olá, mundo!')).toBe(2)
    expect(countWords('... ?!')).toBe(0)
  })
  it('segmenta CJK sem espaços', () => {
    expect(countWords('私は学生です', 'ja')).toBeGreaterThan(1)
  })
  it('sourceLang inválido cai no locale padrão', () => {
    expect(countWords('a b c', 'not a lang!!')).toBe(3)
  })
})

describe('computeContextHashes', () => {
  it('frase longa: hash só do payload (v1\\0\\0payload)', () => {
    const [h] = computeContextHashes(srt('Esta frase tem muitas palavras.'))
    expect(h).toMatchObject({ cueId: 1, contextUsed: false })
    expect(h.hash).toBe(sha('v1\0\0Esta frase tem muitas palavras.'))
  })

  it('frase de até 3 palavras usa o texto puro do anterior', () => {
    const hs = computeContextHashes(srt('Você vem <i>comigo</i> amanhã?', 'Sim, claro.'))
    expect(hs[1].contextUsed).toBe(true)
    expect(hs[1].hash).toBe(sha('v1\0Você vem comigo amanhã?\0Sim, claro.'))
  })

  it('primeiro cue curto usa prev vazio', () => {
    const [h] = computeContextHashes(srt('Sim.'))
    expect(h).toMatchObject({ contextUsed: true, hash: sha('v1\0\0Sim.') })
  })

  it('chave usa o payload: estrutura diferente => hash diferente; raw das tags não importa', () => {
    const [a] = computeContextHashes(ass(ev('0:00:01.00', 'Olá {\\i1}mundo{\\i0} de novo, amigo')))
    const [b] = computeContextHashes(ass(ev('0:00:01.00', 'Olá mundo de novo, amigo')))
    const [c] = computeContextHashes(
      ass(ev('0:00:01.00', '{\\an8}Olá {\\i1}mundo{\\i0} de novo, amigo'))
    )
    expect(a.hash).not.toBe(b.hash)
    expect(c.hash).toBe(a.hash)
    expect(a.unit.payload).toBe('Olá <g1>mundo</g1> de novo, amigo')
  })

  it('anterior = cue traduzível anterior por start.ms, ignorando desenho/karaokê', () => {
    const doc = ass(
      ev('0:00:05.00', 'Sim.'),
      ev('0:00:01.00', 'Primeira fala do episódio.'),
      ev('0:00:02.00', '{\\p1}m 0 0 l 1 1{\\p0}'),
      ev('0:00:03.00', '{\\k20}Ka{\\k20}ra')
    )
    const hs = computeContextHashes(doc)
    expect(hs.map((h) => h.cueId)).toEqual([1, 2]) // ordem do documento, só traduzíveis
    expect(hs.map((h) => h.timeIndex)).toEqual([1, 0])
    expect(hs[0].hash).toBe(sha('v1\0Primeira fala do episódio.\0Sim.'))
  })

  it('empate de start.ms resolve pela ordem do arquivo', () => {
    const doc = ass(ev('0:00:01.00', 'Linha A do arquivo.'), ev('0:00:01.00', 'Ok.'))
    expect(computeContextHashes(doc)[1].hash).toBe(sha('v1\0Linha A do arquivo.\0Ok.'))
  })

  it('normaliza \\h, NFC e espaços antes do hash', () => {
    const [a] = computeContextHashes(ass(ev('0:00:01.00', 'Uma  frase\\hcom café e espaços')))
    const [b] = computeContextHashes(ass(ev('0:00:01.00', 'Uma frase com café e espaços')))
    expect(a.hash).toBe(b.hash)
  })

  it('determinístico', () => {
    const d = srt('Ok.', 'Vamos lá agora mesmo.', 'Tá.')
    expect(computeContextHashes(d)).toEqual(computeContextHashes(d))
  })
})
