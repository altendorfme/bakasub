import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { scanBlocks, type ScannedItem } from './block-scanner'

/** Visão compacta: "cue:<índice|-> <texto>" ou "unparsed:<motivo> <raw>". */
function view(input: string): string[] {
  return scanBlocks(input).map((it) =>
    it.kind === 'cue'
      ? `cue:${it.index ? it.index.raw : '-'} ${JSON.stringify(input.slice(it.textStart, it.end))}`
      : `unparsed:${it.reason} ${JSON.stringify(input.slice(it.start, it.end))}`
  )
}

const T1 = '00:00:01,000 --> 00:00:02,000'
const T2 = '00:00:03,000 --> 00:00:04,000'
const T3 = '00:00:05,000 --> 00:00:06,000'

describe('scanBlocks: estrutura padrão', () => {
  it('dois cues separados por linha em branco', () => {
    expect(view(`1\n${T1}\nOlá\n\n2\n${T2}\nMundo\n`)).toEqual(['cue:1 "Olá"', 'cue:2 "Mundo"'])
  })

  it('cue de várias linhas mantém os EOLs internos', () => {
    expect(view(`1\n${T1}\n- Oi\n- Olá\n`)).toEqual(['cue:1 "- Oi\\n- Olá"'])
  })

  it('CRLF e arquivo sem newline final', () => {
    expect(view(`1\r\n${T1}\r\nOlá\r\n\r\n2\r\n${T2}\r\nFim`)).toEqual([
      'cue:1 "Olá"',
      'cue:2 "Fim"'
    ])
  })

  it('EOL misto no mesmo arquivo', () => {
    expect(view(`1\r\n${T1}\nA\r\nB\r\n\n2\n${T2}\rC`)).toEqual(['cue:1 "A\\r\\nB"', 'cue:2 "C"'])
  })

  it('linhas em branco extras e com espaços entre cues', () => {
    expect(view(`\n\n1\n${T1}\nA\n   \n\n\t\n2\n${T2}\nB\n\n\n`)).toEqual([
      'cue:1 "A"',
      'cue:2 "B"'
    ])
  })

  it('cue sem texto', () => {
    const [c] = scanBlocks(`1\n${T1}\n\n2\n${T2}\nB\n`)
    expect(c.kind === 'cue' && c.timingEol).toBe('')
    expect(view(`1\n${T1}\n\n2\n${T2}\nB\n`)).toEqual(['cue:1 ""', 'cue:2 "B"'])
  })

  it('timing recebe o EOL do cabeçalho quando há texto', () => {
    const [c] = scanBlocks(`1\r\n${T1}\r\nA`)
    expect(c.kind === 'cue' && c.timingEol).toBe('\r\n')
    expect(c.kind === 'cue' && c.index).toEqual({ raw: '1', eol: '\r\n' })
  })
})

describe('scanBlocks: recuperação', () => {
  it('cues colados, sem linha em branco entre eles', () => {
    expect(view(`1\n${T1}\nA\n2\n${T2}\nB\n3\n${T3}\nC\n`)).toEqual([
      'cue:1 "A"',
      'cue:2 "B"',
      'cue:3 "C"'
    ])
  })

  it('cues sem índice', () => {
    expect(view(`${T1}\nA\n\n${T2}\nB\n`)).toEqual(['cue:- "A"', 'cue:- "B"'])
  })

  it('cues sem índice e sem linha em branco', () => {
    expect(view(`${T1}\nA\n${T2}\nB\n`)).toEqual(['cue:- "A"', 'cue:- "B"'])
  })

  it('índices duplicados, fora de ordem ou com espaços', () => {
    expect(view(`7\n${T1}\nA\n\n7\n${T2}\nB\n\n 3 \n${T3}\nC\n`)).toEqual([
      'cue:7 "A"',
      'cue:7 "B"',
      'cue: 3  "C"'
    ])
  })

  it('texto do cue terminado por número: o número vira índice do próximo', () => {
    // Ambiguidade inerente: sem linha em branco, "42" + timing é lido como índice.
    expect(view(`1\n${T1}\nTenho\n42\n${T2}\nB\n`)).toEqual(['cue:1 "Tenho"', 'cue:42 "B"'])
  })

  it('texto órfão depois de linha em branco', () => {
    expect(view(`1\n${T1}\nA\n\ncontinuação solta\n\n2\n${T2}\nB\n`)).toEqual([
      'cue:1 "A"',
      'unparsed:orphan-text "continuação solta"',
      'cue:2 "B"'
    ])
  })

  it('lixo antes do primeiro cue', () => {
    expect(view(`Título do arquivo\n\n1\n${T1}\nA\n`)).toEqual([
      'unparsed:orphan-text "Título do arquivo"',
      'cue:1 "A"'
    ])
  })

  it('linha com "-->" ilegível: bloco bad-timing inclui o índice e o texto', () => {
    expect(view(`1\n00:00:01,000 --> quebrado\nA\n\n2\n${T2}\nB\n`)).toEqual([
      'unparsed:bad-timing "1\\n00:00:01,000 --> quebrado\\nA"',
      'cue:2 "B"'
    ])
  })

  it('índice solto sem timing: empty-block', () => {
    expect(view(`1\n${T1}\nA\n\n99\n\n2\n${T2}\nB\n`)).toEqual([
      'cue:1 "A"',
      'unparsed:empty-block "99"',
      'cue:2 "B"'
    ])
  })

  it('entrada vazia ou só espaços não gera itens', () => {
    expect(scanBlocks('')).toEqual([])
    expect(scanBlocks(' \n\r\n\t')).toEqual([])
  })
})

describe('scanBlocks: números de linha', () => {
  it('line aponta para a linha de índice (ou timing) de cada item', () => {
    const items = scanBlocks(`1\n${T1}\nA\n\nlixo\n\n${T2}\nB\n`)
    expect(items.map((i) => i.line)).toEqual([1, 5, 7])
  })
})

describe('scanBlocks: propriedades', () => {
  const lineGen = fc.constantFrom(
    '1',
    '12',
    ' 3 ',
    T1,
    T2,
    '00:00:01.5 --> 00:00:02',
    '00:00:01,000 --> lixo',
    'Olá',
    '- Oi',
    '{\\an8}x',
    '<i>t</i>',
    '',
    '   ',
    'texto solto',
    '99'
  )
  const eolGen = fc.constantFrom('\n', '\r\n', '\r')
  const doc = fc
    .array(fc.tuple(lineGen, eolGen), { maxLength: 30 })
    .chain((ls) =>
      fc
        .boolean()
        .map((nl) => ls.map(([l, e], k) => l + (k === ls.length - 1 && !nl ? '' : e)).join(''))
    )

  const checkCoverage = (input: string, items: ScannedItem[]): boolean => {
    let prev = 0
    for (const it of items) {
      if (it.start < prev || it.end < it.start) return false
      // O que sobra entre itens só pode ser EOL/espaço em branco.
      if (!/^\s*$/.test(input.slice(prev, it.start))) return false
      prev = it.end
    }
    return /^\s*$/.test(input.slice(prev))
  }

  it('os itens são ordenados, não se sobrepõem e o espaço entre eles é só whitespace', () => {
    fc.assert(fc.property(doc, (input) => checkCoverage(input, scanBlocks(input))))
  })

  it('nenhum conteúdo não-vazio fica de fora dos itens', () => {
    fc.assert(
      fc.property(doc, (input) => {
        const items = scanBlocks(input)
        const covered = items.map((i) => input.slice(i.start, i.end)).join('')
        return covered.replace(/\s/g, '') === input.replace(/\s/g, '')
      })
    )
  })

  it('qualquer string arbitrária também é coberta sem exceção', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (s) =>
        checkCoverage(s, scanBlocks(s))
      )
    )
  })
})
