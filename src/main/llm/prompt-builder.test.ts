import { describe, expect, it } from 'vitest'
import { srtFormat } from '../parsers/srt'
import { toTranslationUnit, type Cue } from '../parsers'
import {
  buildRepairMessage,
  buildSystemPrompt,
  buildTranslateMessage,
  languageName,
  parseGlossary,
  responseSchema
} from './prompt-builder'
import { languageNotes } from './language-notes'

describe('parseGlossary', () => {
  it('aceita {source, target?, rule?}; descarta inválidos', () => {
    const r = parseGlossary([
      { source: 'senpai', rule: 'keep as is' },
      { source: 'Konoha', target: 'Folha' },
      { source: '' },
      { target: 'x' },
      'lixo',
      { source: 'só source' }
    ])
    expect(r.entries).toEqual([
      { source: 'senpai', rule: 'keep as is' },
      { source: 'Konoha', target: 'Folha' }
    ])
    expect(r.invalid).toBe(4)
  })
})

describe('languageName', () => {
  it('nome por extenso em inglês, com variante', () => {
    expect(languageName('pt-BR')).toBe('Brazilian Portuguese')
    expect(languageName('ja')).toBe('Japanese')
  })
})

describe('buildSystemPrompt', () => {
  const p = buildSystemPrompt({
    targetLang: 'pt-BR',
    sourceLang: 'en',
    glossary: [
      { source: 'senpai', rule: 'keep Japanese honorifics' },
      { source: 'Konoha', target: 'Folha' }
    ]
  })
  it('glossário no topo, antes das regras', () => {
    expect(p.indexOf('<glossary>')).toBeLessThan(p.indexOf('Rules'))
    expect(p).toContain('1. "senpai": keep Japanese honorifics')
    expect(p).toContain('2. "Konoha" → "Folha"')
  })
  it('idiomas por extenso e regras de marcadores', () => {
    expect(p).toContain('from English to Brazilian Portuguese')
    expect(p).toMatch(/<gN>…<\/gN>/)
    expect(p).toContain('<xN/>')
    expect(p).toContain('<br/>')
  })
  it('estilo do preset entre o glossário e as regras fixas (que prevalecem)', () => {
    const sp = buildSystemPrompt({
      targetLang: 'pt-BR',
      glossary: [{ source: 'senpai', rule: 'keep' }],
      stylePrompt: '  Media type: anime.  '
    })
    const g = sp.indexOf('<glossary>')
    const st = sp.indexOf('<style>\nMedia type: anime.\n</style>')
    const rules = sp.indexOf('Rules (they always apply')
    expect(g).toBeGreaterThanOrEqual(0)
    expect(st).toBeGreaterThan(g)
    expect(rules).toBeGreaterThan(st)
    expect(
      buildSystemPrompt({ targetLang: 'pt-BR', glossary: [], stylePrompt: ' ' })
    ).not.toContain('<style>')
  })
  it('regras de escrita idiomática parametrizadas pelo idioma-alvo', () => {
    expect(p).toContain('6. Write idiomatic Brazilian Portuguese')
    expect(p).toContain('imperative mood of Brazilian Portuguese')
    expect(p).toContain('Brazilian Portuguese notes:')
    expect(p).toContain('1990 Orthographic Agreement')
    const es = buildSystemPrompt({ targetLang: 'es-419', glossary: [] })
    expect(es).toContain('6. Write idiomatic Latin American Spanish')
    expect(es).toContain('¡Apunten!')
    expect(es).not.toContain('Orthographic Agreement')
    const ja = buildSystemPrompt({ targetLang: 'ja', glossary: [] })
    expect(ja).toContain('Never translate them literally.')
    expect(ja).toContain('current official spelling of Japanese.\n\nOutput:')
    expect(ja).not.toContain(' notes:')
  })
  it('regra de gênero só para idiomas com concordância', () => {
    const rule = /7\. .* marks gender where the source often does not/
    for (const targetLang of ['pt-BR', 'pt-PT', 'es', 'es-419', 'fr', 'de', 'it', 'ru', 'pl']) {
      const sp = buildSystemPrompt({ targetLang, glossary: [] })
      expect(sp, targetLang).toMatch(rule)
      expect(sp, targetLang).toContain('consistent for the same character')
      expect(sp, targetLang).toContain('gender-neutral phrasing instead of guessing')
    }
    for (const targetLang of ['en', 'en-US', 'ja', 'zh', 'zh-Hans', 'ko', 'tr']) {
      expect(buildSystemPrompt({ targetLang, glossary: [] }), targetLang).not.toMatch(rule)
    }
    expect(p).toContain('7. Brazilian Portuguese marks gender')
    expect(p).toContain('"Que cansaço!"')
    expect(buildSystemPrompt({ targetLang: 'es', glossary: [] })).toContain('"Estoy lista"')
  })
  it('regra de gênero cabe em ~150 tokens (regra + exemplo pt-BR)', () => {
    const without = buildSystemPrompt({ targetLang: 'en', glossary: [] })
    const withRule = buildSystemPrompt({ targetLang: 'it', glossary: [] })
    const ruleChars = withRule.length - without.length - ('Italian'.length - 'English'.length)
    const noteChars = languageNotes('pt-BR').find((n) => n.startsWith('Gender:'))?.length ?? 0
    // ~4 caracteres por token em inglês (o preflight conta com o tokenizer real).
    expect(Math.ceil((ruleChars + noteChars) / 4)).toBeLessThanOrEqual(150)
  })
  it('sem glossário: sem bloco <glossary>', () => {
    expect(buildSystemPrompt({ targetLang: 'pt-BR', glossary: [] })).not.toContain('<glossary>')
  })
  it('estável (cache de prompt do provedor)', () => {
    expect(p).toMatchSnapshot()
  })
})

describe('mensagens', () => {
  it('translate: context (com traduções) e target com payload', () => {
    const m = buildTranslateMessage({
      context: {
        before: [{ cueId: 1, source: 'Hi', translation: 'Oi' }],
        after: [{ cueId: 4, source: 'Bye' }]
      },
      targets: [
        { cueId: 2, payload: 'Hello <g1>world</g1>' },
        { cueId: 3, payload: 'Line<br/>two' }
      ]
    })
    expect(m).toMatchSnapshot()
    expect(m).toContain('<line id="2">Hello <g1>world</g1></line>')
    expect(m).toContain('<line id="1"><source>Hi</source><translation>Oi</translation></line>')
  })
  it('media vai no System Prompt (prefixo estável do cache), nunca na mensagem do chunk', () => {
    const base = { targetLang: 'pt-BR', glossary: [] }
    const sys = buildSystemPrompt({ ...base, media: '  Anime X, S01E02  ' })
    expect(sys).toContain('<media>\nAnime X, S01E02\n</media>')
    expect(sys.startsWith(buildSystemPrompt(base))).toBe(true)
    expect(buildSystemPrompt({ ...base, media: '   ' })).toBe(buildSystemPrompt(base))
  })
  it('translate sem contexto omite os blocos', () => {
    const m = buildTranslateMessage({
      context: { before: [], after: [] },
      targets: [{ cueId: 1, payload: 'a' }]
    })
    expect(m).not.toContain('<media>')
    expect(m).not.toContain('<context>')
  })
  it('repair: descreve cada problema com o marcador concreto', () => {
    const cue = srtFormat.parse('1\n00:00:01,000 --> 00:00:02,000\nA <i>b</i> c {\\an8} d\n')
      .items[0] as Cue<unknown>
    const unit = toTranslationUnit(cue)!
    const m = buildRepairMessage({
      context: { before: [], after: [] },
      failures: [
        {
          unit,
          returned: 'A b c d',
          issues: [
            { code: 'MISSING_MARKER', id: 1 },
            { code: 'MISSING_MARKER', id: 2 }
          ]
        }
      ]
    })
    expect(m).toContain('<g1>…</g1> is missing')
    expect(m).toContain('<x2/> is missing')
    expect(m).toContain('<returned>A b c d</returned>')
    expect(m).toMatchSnapshot()
  })
})

describe('responseSchema', () => {
  it('chaves exatas, todas obrigatórias, sem extras', () => {
    expect(responseSchema([3, 1])).toEqual({
      type: 'object',
      properties: { '3': { type: 'string' }, '1': { type: 'string' } },
      required: ['3', '1'],
      additionalProperties: false
    })
  })
})
