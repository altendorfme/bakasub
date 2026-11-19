import { describe, expect, it } from 'vitest'
import { TEST_PRESET } from './test-presets'
import { buildPresetFile, parsePresetFile } from './preset-file'

describe('buildPresetFile', () => {
  it('formato versionado, sem ids nem metadados locais', () => {
    const f = buildPresetFile([TEST_PRESET], new Date(0))
    expect(f).toEqual({
      format: 'bakasub-presets',
      version: 1,
      exportedAt: '1970-01-01T00:00:00.000Z',
      presets: [
        {
          name: 'P',
          mediaType: 'anime',
          temperature: 0.3,
          prompt: 'Keep honorifics.',
          glossary: [{ source: 'senpai', rule: 'keep' }]
        }
      ]
    })
  })
})

describe('parsePresetFile', () => {
  const file = (presets: unknown[], over: Record<string, unknown> = {}): string =>
    JSON.stringify({ format: 'bakasub-presets', version: 1, exportedAt: 'x', presets, ...over })
  const good = buildPresetFile([TEST_PRESET], new Date(0)).presets[0]

  it('round-trip', () => {
    const r = parsePresetFile(JSON.stringify(buildPresetFile([TEST_PRESET], new Date(0))))
    expect(r).toEqual({ valid: [{ index: 0, data: { ...good } }], invalid: [] })
  })

  it('entradas inválidas são relatadas, as válidas seguem; campos extras ignorados', () => {
    const r = parsePresetFile(
      file([{ ...good, id: 'x', builtin: true }, { ...good, temperature: 9 }, { name: 'só nome' }])
    )
    expect(r.valid.map((v) => v.index)).toEqual([0])
    expect(r.valid[0].data).not.toHaveProperty('id')
    expect(r.invalid.map((i) => i.index)).toEqual([1, 2])
    expect(r.invalid[1].name).toBe('só nome')
  })

  it('campos de versões antigas (model/targetLang) são ignorados', () => {
    const r = parsePresetFile(file([{ ...good, model: 'a/b', targetLang: 'pt-br' }]))
    expect(r.valid[0].data).not.toHaveProperty('model')
    expect(r.valid[0].data).not.toHaveProperty('targetLang')
  })

  it('tipo de mídia é livre (1..40)', () => {
    const r = parsePresetFile(
      file([
        { ...good, mediaType: 'Sitcom' },
        { ...good, name: 'x', mediaType: '' }
      ])
    )
    expect(r.valid.map((v) => v.data.mediaType)).toEqual(['Sitcom'])
    expect(r.invalid.map((i) => i.index)).toEqual([1])
  })

  it.each([
    ['não é JSON', '{oops'],
    ['formato errado', JSON.stringify({ format: 'other', version: 1, presets: [] })],
    ['versão futura', JSON.stringify({ format: 'bakasub-presets', version: 2, presets: [] })],
    ['sem presets', JSON.stringify({ format: 'bakasub-presets', version: 1 })],
    [
      'presets demais',
      JSON.stringify({ format: 'bakasub-presets', version: 1, presets: Array(501).fill({}) })
    ]
  ])('%s => INVALID_PRESET_FILE', (_l, text) => {
    expect(() => parsePresetFile(text)).toThrow(
      expect.objectContaining({ code: 'INVALID_PRESET_FILE' })
    )
  })
})
