import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { TEST_PRESET, testPresetSource } from '../presets/test-presets'
import { resolveJobSpec } from './job-spec'

let dir: string
const presets = testPresetSource()
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bakasub-spec-'))
  writeFileSync(join(dir, 'ep01.mkv'), 'mkv')
  writeFileSync(join(dir, 'ep01.en.srt'), 'srt')
  writeFileSync(join(dir, 'ep01.pt-BR.ass'), 'ass')
  mkdirSync(join(dir, 'out'))
})

describe('resolveJobSpec', () => {
  it('translate: congela o preset resolvido, idioma padrão do perfil, sourceLang do nome, saída ao lado', async () => {
    const s = await resolveJobSpec(
      { kind: 'translate', source: join(dir, 'ep01.en.srt'), presetId: 'p-test' },
      presets
    )
    expect(s).toEqual({
      kind: 'translate',
      source: join(dir, 'ep01.en.srt'),
      sourceSize: 3,
      preset: {
        id: 'p-test',
        name: 'P',
        mediaType: 'anime',
        model: 'a/b',
        glossary: TEST_PRESET.glossary,
        temperature: 0.3,
        prompt: 'Keep honorifics.'
      },
      targetLang: 'pt-BR',
      sourceLang: 'en',
      outputDir: dir,
      confirmBeforeTranslate: true
    })
  })

  it('pipeline: opções padrão; sourceLang explícito canonizado', async () => {
    const s = await resolveJobSpec(
      {
        kind: 'pipeline',
        source: join(dir, 'ep01.mkv'),
        trackId: 2,
        presetId: 'p-test',
        targetLang: 'es-419',
        sourceLang: 'EN',
        outputDir: join(dir, 'out')
      },
      presets
    )
    expect(s).toMatchObject({
      kind: 'pipeline',
      trackId: 2,
      targetLang: 'es-419',
      sourceLang: 'en',
      outputDir: join(dir, 'out'),
      setDefault: true,
      keepOriginalSubtitles: true,
      alsoWriteSubtitle: false,
      confirmBeforeTranslate: true
    })
  })

  it('mux: idioma pré-preenchido pelo nome não é necessário quando enviado; nome padrão do idioma', async () => {
    const s = await resolveJobSpec(
      {
        kind: 'mux',
        source: join(dir, 'ep01.mkv'),
        subtitles: [{ path: join(dir, 'ep01.pt-BR.ass'), language: 'pt-br' }]
      },
      presets
    )
    expect(s).toMatchObject({
      kind: 'mux',
      subtitles: [
        {
          path: join(dir, 'ep01.pt-BR.ass'),
          language: 'pt-BR',
          name: 'Brazilian Portuguese',
          default: true
        }
      ],
      setDefault: true
    })
  })

  it('extract: ids únicos e não vazios', async () => {
    const s = await resolveJobSpec(
      { kind: 'extract', source: join(dir, 'ep01.mkv'), trackIds: [3, 2, 3] },
      presets
    )
    expect(s).toMatchObject({ kind: 'extract', trackIds: [2, 3] })
    await expect(
      resolveJobSpec({ kind: 'extract', source: join(dir, 'ep01.mkv'), trackIds: [] }, presets)
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('caminhos inválidos: extensão errada para o tipo, relativo, pasta de saída inexistente', async () => {
    await expect(
      resolveJobSpec(
        { kind: 'translate', source: join(dir, 'ep01.mkv'), presetId: 'p-test' },
        presets
      )
    ).rejects.toMatchObject({ code: 'INVALID_PATH' })
    await expect(
      resolveJobSpec({ kind: 'extract', source: 'ep01.mkv', trackIds: [1] }, presets)
    ).rejects.toMatchObject({ code: 'INVALID_PATH' })
    await expect(
      resolveJobSpec(
        {
          kind: 'extract',
          source: join(dir, 'ep01.mkv'),
          trackIds: [1],
          outputDir: join(dir, 'nope')
        },
        presets
      )
    ).rejects.toMatchObject({ code: 'INVALID_PATH' })
  })

  it('forma inválida e idioma inválido => INVALID_INPUT', async () => {
    await expect(resolveJobSpec({ kind: 'nope' } as never, presets)).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    })
    await expect(
      resolveJobSpec(
        {
          kind: 'translate',
          source: join(dir, 'ep01.en.srt'),
          presetId: 'p-test',
          targetLang: 'xx yy'
        },
        presets
      )
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('preset padrão; modelo e idioma: pedido > padrão das configurações', async () => {
    const builtin = { ...TEST_PRESET, id: 'builtin:anime' }
    const src = testPresetSource([builtin], { model: 'm/default', targetLang: 'es' })
    const s = await resolveJobSpec({ kind: 'translate', source: join(dir, 'ep01.en.srt') }, src)
    expect(s).toMatchObject({
      preset: { id: 'builtin:anime', model: 'm/default' },
      targetLang: 'es'
    })
    const s2 = await resolveJobSpec(
      {
        kind: 'translate',
        source: join(dir, 'ep01.en.srt'),
        targetLang: 'fr',
        model: 'm/picked'
      },
      src
    )
    expect(s2).toMatchObject({ targetLang: 'fr', preset: { model: 'm/picked' } })
  })

  it('sem modelo no pedido nem padrão: MODEL_NOT_SET', async () => {
    const src = testPresetSource([TEST_PRESET], { model: null })
    await expect(
      resolveJobSpec({ kind: 'translate', source: join(dir, 'ep01.en.srt') }, src)
    ).rejects.toMatchObject({ code: 'MODEL_NOT_SET' })
  })

  it('sem idioma no pedido nem padrão: TARGET_LANG_NOT_SET', async () => {
    const src = testPresetSource([TEST_PRESET], { targetLang: null })
    await expect(
      resolveJobSpec({ kind: 'translate', source: join(dir, 'ep01.en.srt') }, src)
    ).rejects.toMatchObject({ code: 'TARGET_LANG_NOT_SET' })
    const s = await resolveJobSpec(
      { kind: 'translate', source: join(dir, 'ep01.en.srt'), targetLang: 'ja' },
      src
    )
    expect(s).toMatchObject({ targetLang: 'ja' })
  })

  it('notas do usuário: trim; vazias somem; limite de tamanho', async () => {
    const s = await resolveJobSpec(
      { kind: 'translate', source: join(dir, 'ep01.en.srt'), notes: '  Naruto, ep. 3  ' },
      presets
    )
    expect(s).toMatchObject({ notes: 'Naruto, ep. 3' })
    const s2 = await resolveJobSpec(
      { kind: 'translate', source: join(dir, 'ep01.en.srt'), notes: '  ' },
      presets
    )
    expect('notes' in s2).toBe(false)
    await expect(
      resolveJobSpec(
        { kind: 'translate', source: join(dir, 'ep01.en.srt'), notes: 'x'.repeat(4001) },
        presets
      )
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
