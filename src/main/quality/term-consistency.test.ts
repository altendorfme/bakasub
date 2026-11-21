import { describe, expect, it } from 'vitest'
import { srtFormat, type SubtitleDocument } from '../parsers'
import { analyzeTermConsistency } from './term-consistency'

const PRESET = { id: 'p1', name: 'Anime (meu)' }

/** SRT com uma fala por par; os ids dos cues (ordinais) batem entre origem e tradução. */
function docs(pairs: readonly (readonly [string, string])[]): {
  source: SubtitleDocument<unknown>
  translated: SubtitleDocument<unknown>
} {
  const srt = (texts: readonly string[]): string =>
    texts
      .map((t, i) => {
        const s = String(i + 1).padStart(2, '0')
        return `${i + 1}\n00:00:${s},000 --> 00:00:${s},900\n${t}\n`
      })
      .join('\n')
  return {
    source: srtFormat.parse(srt(pairs.map((p) => p[0]))) as SubtitleDocument<unknown>,
    translated: srtFormat.parse(srt(pairs.map((p) => p[1]))) as SubtitleDocument<unknown>
  }
}

/** Gurren Lagann S01E01: "Bro" ora vira "mano", ora fica "Bro"; "Simon" é sempre mantido. */
const BRO_FIXTURE = [
  ['Bro, wait for me!', 'Mano, me espera!'],
  ["You're the best, Bro.", 'Você é o melhor, Bro.'],
  ['Bro! Look at this!', 'Mano! Olha isso!'],
  ['Thanks, Bro.', 'Valeu, mano.'],
  ['Simon, dig!', 'Simon, cave!'],
  ['Simon is the best digger.', 'O Simon é o melhor escavador.'],
  ['Come on, Simon.', 'Vamos, Simon.'],
  ['Where are we going?', 'Aonde vamos?'],
  ['What is that?', 'O que é aquilo?'],
  ['What do you mean, Bro?', 'Como assim, Bro?'],
  ['What now?', 'E agora?'],
  ['Listen up, Bro, we go up.', 'Escuta, mano, a gente vai subir.'],
  ['{\\an8}Next Time', '{\\an8}Next Time']
] as const

describe('analyzeTermConsistency', () => {
  it('lists the two renderings of "Bro" (mano / kept) and leaves consistent names out', () => {
    const { source, translated } = docs(BRO_FIXTURE)
    const r = analyzeTermConsistency(source, translated, PRESET)

    expect(r.preset).toEqual(PRESET)
    // A fala igual à origem (letreiro) não entra na comparação.
    expect(r.analyzedCues).toBe(BRO_FIXTURE.length - 1)
    expect(r.terms.map((t) => t.term)).toEqual(['Bro'])
    const bro = r.terms[0]
    expect(bro.cues).toBe(6)
    expect(bro.unmatched).toBe(0)
    expect(bro.variants.map((v) => [v.text, v.cues, v.kept])).toEqual([
      // Grafia do meio da frase, não a de início de fala ("Mano, me espera!").
      ['mano', 4, false],
      ['Bro', 2, true]
    ])
    expect(bro.variants[1].examples[0]).toEqual({
      cueId: 2,
      line: 5,
      startMs: 2000,
      source: "You're the best, Bro.",
      translation: 'Você é o melhor, Bro.'
    })
    expect(bro.variants[0].examples).toHaveLength(3)
  })

  it('ignores sentence-initial words ("What") and common words', () => {
    const { source, translated } = docs(BRO_FIXTURE)
    const r = analyzeTermConsistency(source, translated, PRESET)
    // Candidatos: Bro e Simon. "What" só aparece em início de frase.
    expect(r.candidates).toBe(2)
  })

  it('flags a term the glossary already pins and skips untranslated lines', () => {
    const { source, translated } = docs(BRO_FIXTURE)
    const r = analyzeTermConsistency(source, translated, PRESET, {
      glossary: [
        { source: 'bro', target: 'mano' },
        { source: 'Simon', rule: 'keep' }
      ],
      skipCueIds: new Set([2])
    })
    const bro = r.terms[0]
    expect(bro.glossaryTarget).toBe('mano')
    expect(bro.variants.map((v) => [v.text, v.cues])).toEqual([
      ['mano', 4],
      ['Bro', 1]
    ])
  })

  it('does not filter by glossary: the renderer hides terms by the current preset glossary', () => {
    // "Bro" varia em todos os casos; o relatório só anota o alvo do glossário do job.
    const { source, translated } = docs(BRO_FIXTURE)
    const withTarget = analyzeTermConsistency(source, translated, PRESET, {
      glossary: [{ source: ' BRO ', target: 'mano' }]
    })
    expect(withTarget.terms.map((t) => [t.term, t.glossaryTarget])).toEqual([['Bro', 'mano']])

    const ruleOnly = analyzeTermConsistency(source, translated, PRESET, {
      glossary: [{ source: 'Bro', rule: 'keep as in the original' }]
    })
    expect(ruleOnly.terms.map((t) => t.term)).toEqual(['Bro'])
    expect(ruleOnly.terms[0]).not.toHaveProperty('glossaryTarget')

    const absent = analyzeTermConsistency(source, translated, PRESET, {
      glossary: [{ source: 'Kamina', target: 'Kamina' }]
    })
    expect(absent.terms.map((t) => t.term)).toEqual(['Bro'])
    expect(absent.terms[0]).not.toHaveProperty('glossaryTarget')
  })

  it('reports nothing when every occurrence uses the same rendering', () => {
    const { source, translated } = docs([
      ['Bro, wait!', 'Mano, espera!'],
      ['Thanks, Bro.', 'Valeu, mano.'],
      ['Come on, Bro.', 'Vamos, mano.'],
      ['Nice one, Bro!', 'Boa, mano!']
    ])
    const r = analyzeTermConsistency(source, translated, PRESET)
    expect(r.candidates).toBe(1)
    expect(r.terms).toEqual([])
  })

  it('treats short inflections as the same rendering ("mano" / "manos")', () => {
    const { source, translated } = docs([
      ['Bro, wait!', 'Mano, espera!'],
      ['Thanks, Bro.', 'Valeu, manos.'],
      ['Come on, Bro.', 'Vamos, mano.'],
      ['Nice one, Bro!', 'Boa, mano!']
    ])
    expect(analyzeTermConsistency(source, translated, PRESET).terms).toEqual([])
  })

  it('stays fast on a ~6,700-event file', () => {
    const names = ['Bro', 'Simon', 'Kamina', 'Yoko', 'Leeron', 'Gunmen', 'Lagann', 'Boota']
    const pairs: [string, string][] = []
    for (let i = 0; i < 6_700; i++) {
      const n = names[i % names.length]
      const tn = n === 'Bro' ? (i % 3 ? 'mano' : 'Bro') : n
      pairs.push([
        `Line ${i}: listen, ${n}, we dig through the surface tonight.`,
        `Fala ${i}: escuta, ${tn}, a gente cava até a superfície hoje.`
      ])
    }
    const { source, translated } = docs(pairs)
    const t0 = performance.now()
    const r = analyzeTermConsistency(source, translated, PRESET)
    const ms = performance.now() - t0
    console.info(`[perf] term consistency, 6.7k cues: ${ms.toFixed(0)}ms`)
    expect(r.terms.find((t) => t.term === 'Bro')?.variants.map((v) => v.text)).toEqual([
      'mano',
      'Bro'
    ])
    expect(ms).toBeLessThan(1500)
  })
})
