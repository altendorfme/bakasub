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
  it('frase longa: hash só do payload (v2\\0\\0payload)', () => {
    const [h] = computeContextHashes(srt('Esta frase tem muitas palavras.'))
    expect(h).toMatchObject({ cueId: 1, contextUsed: false })
    expect(h.hash).toBe(sha('v2\0\0Esta frase tem muitas palavras.'))
  })

  it('frase de até 3 palavras usa o texto puro do anterior', () => {
    const hs = computeContextHashes(srt('Você vem <i>comigo</i> amanhã?', 'Sim, claro.'))
    expect(hs[1].contextUsed).toBe(true)
    expect(hs[1].hash).toBe(sha('v2\0Você vem comigo amanhã?\0Sim, claro.'))
  })

  it('primeiro cue curto usa prev vazio', () => {
    const [h] = computeContextHashes(srt('Sim.'))
    expect(h).toMatchObject({ contextUsed: true, hash: sha('v2\0\0Sim.') })
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
    expect(hs[0].hash).toBe(sha('v2\0Primeira fala do episódio.\0Sim.'))
  })

  it('empate de start.ms resolve pela ordem do arquivo', () => {
    const doc = ass(ev('0:00:01.00', 'Linha A do arquivo.'), ev('0:00:01.00', 'Ok.'))
    expect(computeContextHashes(doc)[1].hash).toBe(sha('v2\0Linha A do arquivo.\0Ok.'))
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

  it('speaker: Name do ASS sem valores genéricos', () => {
    const hs = computeContextHashes(
      ass(
        named('Kamina', 'Who the hell do you think I am?'),
        named('Default', 'Line two here.'),
        named('', 'Line three here.')
      )
    )
    expect(hs.map((h) => h.speaker)).toEqual(['Kamina', undefined, undefined])
  })
})

const named = (name: string, text: string, start = '0:00:01.00'): string =>
  `Dialogue: 0,${start},0:00:59.00,Default,${name},0,0,0,,${text}`

describe('computeContextHashes: falante no hash', () => {
  const line = "I'm so tired of this, seriously."

  it('mesma frase longa com atores diferentes: hashes diferentes', () => {
    const [a, b] = computeContextHashes(ass(named('Simon', line), named('Yoko', line)))
    expect(a.hash).not.toBe(b.hash)
    expect(a.hash).toBe(sha(`v2\x01Simon\0\0${line}`))
  })

  it('mesmo ator: mesmo hash', () => {
    const [a, b] = computeContextHashes(
      ass(named('Simon', line), named('  Simon ', line, '0:00:09.00'))
    )
    expect(a.hash).toBe(b.hash)
  })

  it('sem ator, Name vazio, genérico ou só pontuação: hash do formato sem falante', () => {
    const expected = sha(`v2\0\0${line}`)
    for (const name of ['', 'Default', 'NTP', 'Main', '-', 'Comment', ' default '])
      expect(computeContextHashes(ass(named(name, line)))[0].hash, name).toBe(expected)
    expect(computeContextHashes(srt(line))[0].hash).toBe(expected)
  })

  it('frase curta também leva o falante (além da linha anterior)', () => {
    const hs = computeContextHashes(
      ass(named('Simon', 'Are you coming?'), named('Yoko', 'Thanks.', '0:00:02.00'))
    )
    expect(hs[1].hash).toBe(sha('v2\x01Yoko\0Are you coming?\0Thanks.'))
  })

  it('ator normalizado: NFC e espaços; caixa preservada', () => {
    const nfd = 'Jose\u0301'
    const [a] = computeContextHashes(ass(named(nfd, line)))
    const [b] = computeContextHashes(ass(named('José', line)))
    const [c] = computeContextHashes(ass(named('JOSÉ', line)))
    expect(a.hash).toBe(b.hash)
    expect(c.hash).not.toBe(b.hash)
  })

  it('regressão: sinal "Episode 1" quadro a quadro (120 eventos, mesmo ator) continua agrupado', () => {
    const frames = Array.from({ length: 120 }, (_, i) => {
      const cs = String(i % 100).padStart(2, '0')
      return named(
        'Sign',
        `{\\pos(${640 + i},${360 - i})\\fscx${100 + i}}Episode 1`,
        `0:00:${String(10 + Math.floor(i / 100)).padStart(2, '0')}.${cs}`
      )
    })
    const distinct = (name: string): string[] => {
      const hs = computeContextHashes(ass(...frames.map((f) => f.replace(',Sign,', `,${name},`))))
      expect(hs).toHaveLength(120)
      // "Episode 1" tem 2 palavras: o 1º quadro leva prev '' e os demais prev "Episode 1".
      expect(new Set(hs.slice(1).map((h) => h.hash)).size).toBe(1)
      return [...new Set(hs.map((h) => h.hash))]
    }
    const baseline = distinct('')
    expect(baseline).toHaveLength(2)
    expect(distinct('Sign')).toEqual(baseline) // genérico: igual a sem ator
    expect(distinct('Typesetter')).toHaveLength(2) // ator real: mesma forma de agrupamento
  })
})
