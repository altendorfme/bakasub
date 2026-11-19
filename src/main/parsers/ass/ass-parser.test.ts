import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SubtitleParseError } from '../core/format'
import { analyzeCoverage } from '../core/coverage'
import { applyTranslation, validateTranslation } from '../core/segmentation/reinject'
import { classify, toTranslationUnit } from '../core/segmentation/segmenter'
import type { Cue, SubtitleDocument } from '../core/types'
import { decodeSubtitle } from '../decode/subtitle-decoder'
import { assFormat } from './index'
import { parseAss } from './ass-parser'
import { repairAss } from './ass-repair'
import { serializeAss } from './ass-serializer'
import type { AssCueData } from './types'

const HEADER = `[Script Info]
Title: Teste
ScriptType: v4.00+
PlayResX: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
const FIXTURE = `${HEADER}Dialogue: 0,0:00:01.00,0:00:02.50,Default,Bob,0,0,0,,{\\an8}Olá, {\\i1}mundo{\\i0}\\Ncom, vírgulas, no texto
Comment: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{nota de tradução} linha comentada
Dialogue: 1,0:00:05.00,0:00:06.00,Default,,0,0,0,karaoke,{\\k20}Ka{\\k30}ra{\\k25}o{\\k40}ke
Dialogue: 2,0:00:07.00,0:00:08.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}
`

const cuesOf = (doc: SubtitleDocument<AssCueData>): Cue<AssCueData>[] =>
  doc.items.filter((i): i is Cue<AssCueData> => i.kind === 'cue')

describe('parseAss: estrutura', () => {
  const doc = parseAss(FIXTURE)
  const [a, k, d] = cuesOf(doc)

  it('só Dialogue: de [Events] vira cue; Comment: e o resto ficam em leading', () => {
    expect(doc.format).toBe('ass')
    expect(doc.items).toHaveLength(3)
    expect(k.leading).toContain('Comment: 0,0:00:03.00')
    expect(a.leading).toContain('[Script Info]')
  })

  it('campos, metadados e tempo', () => {
    expect(a).toMatchObject({
      id: 1,
      style: 'Default',
      actor: 'Bob',
      start: { ms: 1000, raw: '0:00:01.00' },
      end: { ms: 2500 },
      line: 12,
      format: { layer: '0', marginL: '0', effect: '' }
    })
    expect(k.actor).toBeUndefined()
    expect(k.format.effect).toBe('karaoke')
    expect(d.id).toBe(3)
  })

  it('Text vai até o fim, preservando vírgulas', () => {
    expect(a.nodes.map((n) => (n.type === 'text' ? n.value : n.raw)).join('')).toBe(
      '{\\an8}Olá, {\\i1}mundo{\\i0}\\Ncom, vírgulas, no texto'
    )
    expect(a.nodes.filter((n) => n.type === 'br')).toHaveLength(1)
  })

  it('round-trip exato', () => {
    expect(serializeAss(doc)).toBe(FIXTURE)
  })

  it('sem diagnósticos no fixture limpo', () => {
    expect(doc.diagnostics).toEqual([])
  })
})

describe('parseAss: dialeto', () => {
  const ev = 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Oi\n'
  it('SSA por ScriptType v4.00', () => {
    expect(parseAss(`[Script Info]\nScriptType: v4.00\n\n[Events]\n${ev}`).format).toBe('ssa')
  })
  it('SSA por seção [V4 Styles] sem ScriptType', () => {
    expect(parseAss(`[V4 Styles]\nFormat: Name\n\n[Events]\n${ev}`).format).toBe('ssa')
  })
  it('ASS por padrão', () => {
    expect(parseAss(`[Events]\n${ev}`).format).toBe('ass')
  })
  it('SSA: coluna Marked ocupa o lugar de Layer', () => {
    const src = `[Script Info]\nScriptType: v4.00\n[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: Marked=0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Oi\n`
    expect(cuesOf(parseAss(src))[0].format.layer).toBe('Marked=0')
  })
})

describe('parseAss: Format e eventos defeituosos', () => {
  it('Format: ausente usa colunas padrão e avisa uma vez', () => {
    const src = `[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,A\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,B\n`
    const doc = parseAss(src)
    expect(cuesOf(doc)).toHaveLength(2)
    expect(doc.diagnostics.map((x) => [x.code, x.params])).toEqual([
      ['ASS_FORMAT_MISSING', { reason: 'missing' }]
    ])
  })

  it('Format: com colunas reordenadas', () => {
    const src = `[Events]\nFormat: Start, End, Text, \nDialogue: x\n`
    // Text não é o último: inválido, cai nos padrões (e o evento fica ilegível)
    const doc = (): SubtitleDocument<AssCueData> => parseAss(src)
    expect(doc).toThrow(SubtitleParseError)

    const ok = parseAss(
      `[Events]\nFormat: Start, End, Style, Text\nDialogue: 0:00:01.00,0:00:02.00,Alt,Olá, você\n`
    )
    const c = cuesOf(ok)[0]
    expect(c.style).toBe('Alt')
    expect(c.nodes).toEqual([{ type: 'text', value: 'Olá, você' }])
  })

  it('poucas colunas ou tempo ilegível: UnparsedBlock bad-event, verbatim', () => {
    const src = `[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Ok\nDialogue: 0,xx,0:00:02.00,Default,,0,0,0,,Ruim\nDialogue: 0,0:00:01.00\n`
    const doc = parseAss(src)
    const blocks = doc.items.filter((i) => i.kind === 'unparsed')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ reason: 'bad-event', blockIndex: 1, line: 3 })
    expect(doc.diagnostics.filter((x) => x.code === 'ASS_UNPARSEABLE_EVENT')).toHaveLength(2)
    expect(serializeAss(doc)).toBe(src)
    expect(classify(blocks[0])).toEqual({
      status: 'untranslated',
      reason: 'UNTRANSLATED_BAD_EVENT'
    })
  })

  it('tempo legível fora do padrão e fim<início só geram relato', () => {
    const src = `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:03.5,0:00:02.00,Default,,0,0,0,,Oi\n`
    const doc = parseAss(src)
    expect(doc.diagnostics.map((x) => x.code)).toEqual(['ASS_TIME_FORMAT', 'ASS_END_BEFORE_START'])
    expect(serializeAss(doc)).toBe(src)
  })

  it('entrada vazia e sem eventos lançam SubtitleParseError', () => {
    expect(() => parseAss('  \n')).toThrowError(SubtitleParseError)
    expect(() => parseAss('[Script Info]\nTitle: x\n')).toThrowError(SubtitleParseError)
  })

  it('Dialogue: fora de [Events] é trivia', () => {
    const src = `[Fonts]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,x\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,y\n`
    expect(cuesOf(parseAss(src))).toHaveLength(1)
  })
})

describe('saída estilo mkvextract (BOM + CRLF + Comment: no cabeçalho)', () => {
  const body = FIXTURE.replace(/\n/g, '\r\n')
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, 'utf8')])
  it('decodifica, parseia e reproduz', () => {
    const { text, meta } = decodeSubtitle(bytes)
    expect(meta.bom).toBe(true)
    const doc = assFormat.parse(text, meta)
    expect(cuesOf(doc)).toHaveLength(3)
    expect(assFormat.serialize(doc)).toBe(text)
  })
})

describe('classify / cobertura', () => {
  const doc = parseAss(FIXTURE)
  const [a, k, d] = cuesOf(doc)

  it('texto normal é traduzível; pares viram <gN>', () => {
    const unit = toTranslationUnit(a)!
    expect(unit.payload).toBe('Olá, <g1>mundo</g1><br/>com, vírgulas, no texto')
    expect(unit.skeleton.head).toHaveLength(1)
  })
  it('desenho: skipped; karaokê: untranslated', () => {
    expect(classify(d)).toEqual({ status: 'skipped', reason: 'SKIPPED_DRAWING' })
    expect(classify(k)).toEqual({ status: 'untranslated', reason: 'UNTRANSLATED_KARAOKE' })
  })
  it('\\pos e \\p0 não são desenho', () => {
    const c = cuesOf(
      parseAss(`[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,{\\pos(1,2)\\p0}Oi\n`)
    )[0]
    expect(classify(c).status).toBe('translatable')
  })
  it('relatório agrega os motivos novos', () => {
    const r = analyzeCoverage(doc)
    expect(r.byReason).toEqual({ UNTRANSLATED_KARAOKE: 1, SKIPPED_DRAWING: 1 })
    expect(r.totals).toMatchObject({ translatable: 1, skipped: 1, untranslated: 1 })
  })
  it('bad-event aparece na cobertura com a causa ASS', () => {
    const r = analyzeCoverage(
      parseAss(
        `[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,Ok\nDialogue: 0,xx,0:00:02.00,D,,0,0,0,,Ruim\n`
      )
    )
    expect(r.entries[0]).toMatchObject({
      reason: 'UNTRANSLATED_BAD_EVENT',
      cause: 'ASS_UNPARSEABLE_EVENT'
    })
  })
})

describe('tradução: reinjeção no ASS', () => {
  const a = cuesOf(parseAss(FIXTURE))[0]
  const unit = toTranslationUnit(a)!

  it('reconstrói a linha com tags e quebras originais', () => {
    const r = applyTranslation(
      a,
      unit,
      'Hello, <g1>world</g1><br/>with, commas, in the text',
      assFormat.lexInline
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const doc = parseAss(FIXTURE)
    const out = serializeAss({ ...doc, items: [r.cue, ...doc.items.slice(1)] })
    expect(out).toContain(
      'Default,Bob,0,0,0,,{\\an8}Hello, {\\i1}world{\\i0}\\Nwith, commas, in the text'
    )
  })
  it('rejeita \\N cru, {tag} inventada e comentário', () => {
    const lex = assFormat.lexInline
    expect(validateTranslation(unit, 'Hi <g1>x</g1><br/>a\\Nb', lex).map((i) => i.code)).toContain(
      'RAW_NEWLINE'
    )
    expect(
      validateTranslation(unit, 'Hi <g1>{\\b1}x</g1><br/>a', lex).map((i) => i.code)
    ).toContain('INVENTED_TAG')
    expect(
      validateTranslation(unit, 'Hi {nota} <g1>x</g1><br/>a', lex).map((i) => i.code)
    ).toContain('INVENTED_TAG')
  })
  it('MARKER_ORDER: overrides soltos mantêm a ordem', () => {
    const c = cuesOf(
      parseAss(`[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,A{\\an8}B{\\pos(1,2)}C\n`)
    )[0]
    const u = toTranslationUnit(c)!
    expect(u.payload).toBe('A<x1/>B<x2/>C')
    expect(validateTranslation(u, 'A<x1/>B<x2/>C', assFormat.lexInline)).toEqual([])
    expect(validateTranslation(u, 'A<x2/>B<x1/>C', assFormat.lexInline).map((i) => i.code)).toEqual(
      ['MARKER_ORDER']
    )
  })
})

describe('reparo ASS', () => {
  it('unifica EOL misto no dominante e só isso', () => {
    const src = FIXTURE.replace(/\n/g, '\r\n').replace('\r\nComment', '\nComment')
    const doc = parseAss(src)
    expect(doc.diagnostics.map((x) => x.code)).toContain('ASS_EOL_MIXED')
    const r = repairAss(doc)
    expect(r.text).toBe(FIXTURE.replace(/\n/g, '\r\n'))
    expect(r.applied).toEqual([{ code: 'ASS_EOL_MIXED', line: 1 }])
  })
  it('arquivo limpo: idêntico e idempotente', () => {
    const doc = parseAss(FIXTURE)
    const r = repairAss(doc)
    expect(r.text).toBe(FIXTURE)
    expect(r.applied).toEqual([])
  })
  it('relatos (tempo fora do padrão) não são alterados', () => {
    const src = `[Events]\nDialogue: 0,0:00:03.5,0:00:02.00,D,,0,0,0,,  Oi  \n`
    expect(repairAss(parseAss(src)).text).toBe(src)
  })
  it("unparsed: 'drop' remove a linha sem deixar linha em branco", () => {
    const src = `[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,Ok\nDialogue: 0,xx,0:00:02.00,D,,0,0,0,,Ruim\nDialogue: 0,0:00:03.00,0:00:04.00,D,,0,0,0,,Fim\n`
    const r = repairAss(parseAss(src), { unparsed: 'drop' })
    expect(r.text).toBe(
      `[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,Ok\nDialogue: 0,0:00:03.00,0:00:04.00,D,,0,0,0,,Fim\n`
    )
    expect(r.applied.map((x) => x.code)).toEqual(['ASS_UNPARSEABLE_EVENT'])
  })
})

describe('propriedade: serialize(parse(s)) === s', () => {
  const piece = fc.constantFrom(
    'Dialogue: 0,0:00:01.00,0:00:02.00,Default,Bob,0,0,0,,Olá, {\\i1}x{\\i0}\\Ny',
    'Dialogue: 0,0:00:0x.00,0:00:02.00,Default,,0,0,0,,ruim',
    'Dialogue: 1,0:00:01.5,0:00:02.00,Default,,0,0,0,fx,{\\k20}ka{',
    'Dialogue: 0,0:00:01.00',
    'Dialogue:',
    'Comment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{c}',
    '[Events]',
    '[Script Info]',
    'ScriptType: v4.00',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Format: Start, End, Text, Style',
    '; comentário',
    '',
    '   ',
    '{\\p1}m 0 0{\\p0}',
    'ü\u0000{}\\'
  )
  const eol = fc.constantFrom('\n', '\r\n', '\r')
  const doc = fc
    .tuple(fc.array(fc.tuple(piece, eol), { maxLength: 30 }), fc.string({ maxLength: 8 }))
    .map(
      ([lines, tail]) =>
        '[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,D,,0,0,0,,x\n' +
        lines.map(([l, e]) => l + e).join('') +
        tail
    )

  it('qualquer entrada que parseia reproduz o original', () => {
    fc.assert(
      fc.property(doc, (s) => {
        const d = parseAss(s)
        expect(serializeAss(d)).toBe(s)
        // reparo não lança e é idempotente
        const r = repairAss(d)
        expect(repairAss(parseAss(r.text)).text).toBe(r.text)
      }),
      { numRuns: 400 }
    )
  })
})
