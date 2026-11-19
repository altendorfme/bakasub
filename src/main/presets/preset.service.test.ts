import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PresetRepository } from '../database/repositories/preset.repository'
import { openTestDatabase } from '../database/test-db'
import { BUILTIN_PRESETS } from './builtin-presets'
import { PresetService } from './preset.service'

let t: Awaited<ReturnType<typeof openTestDatabase>>
let inUse: Set<string>
let svc: PresetService
beforeEach(async () => {
  t = await openTestDatabase()
  inUse = new Set()
  let n = 0
  svc = new PresetService(new PresetRepository(t.db), {
    isInUse: (id) => inUse.has(id),
    newId: () => `p${++n}`
  })
})
afterEach(() => t.close())

const custom = {
  name: 'Anime: Naruto',
  mediaType: 'anime' as const,
  temperature: 0.5,
  prompt: 'Keep jutsu names in Japanese.',
  glossary: [{ source: 'Konoha', target: 'Folha' }]
}

describe('presets embutidos', () => {
  it('quatro, imutáveis, com temperatura e prompt por tipo de mídia', async () => {
    const list = await svc.list()
    expect(list.filter((p) => p.builtin).map((p) => [p.id, p.mediaType, p.temperature])).toEqual([
      ['builtin:movie', 'Movie', 0.35],
      ['builtin:series', 'Series', 0.35],
      ['builtin:anime', 'Anime', 0.45],
      ['builtin:documentary', 'Documentary', 0.2]
    ])
    for (const p of BUILTIN_PRESETS) {
      expect(p.prompt.length).toBeGreaterThan(100)
      expect(p).toMatchObject({ glossary: [] })
      expect(p).not.toHaveProperty('model')
    }
    expect(Object.isFrozen(BUILTIN_PRESETS[0])).toBe(true)
  })

  it('não podem ser alterados nem removidos', async () => {
    await expect(svc.update('builtin:anime', custom)).rejects.toMatchObject({
      code: 'PRESET_READ_ONLY'
    })
    await expect(svc.delete('builtin:anime')).rejects.toMatchObject({ code: 'PRESET_READ_ONLY' })
  })

  it('prompts estáveis (mudanças são deliberadas)', () => {
    expect(BUILTIN_PRESETS.map((p) => p.prompt)).toMatchSnapshot()
  })
})

describe('presets personalizados', () => {
  it('create do zero; aparecem depois dos embutidos', async () => {
    const p = await svc.create(custom)
    expect(p).toMatchObject({ id: 'p1', builtin: false, mediaType: 'anime', copiedFrom: null })
    expect((await svc.list()).map((x) => x.id)).toEqual([
      'builtin:movie',
      'builtin:series',
      'builtin:anime',
      'builtin:documentary',
      'p1'
    ])
  })

  it('duplicate copia um embutido (ou personalizado) com novo nome', async () => {
    const copy = await svc.duplicate('builtin:anime', 'Meu anime')
    const anime = await svc.get('builtin:anime')
    expect(copy).toMatchObject({
      builtin: false,
      name: 'Meu anime',
      mediaType: 'Anime',
      temperature: anime.temperature,
      prompt: anime.prompt,
      copiedFrom: 'builtin:anime'
    })
    const auto = await svc.duplicate(copy.id)
    expect(auto.name).toBe('Meu anime (copy)')
    expect((await svc.duplicate(copy.id)).name).toBe('Meu anime (copy 2)')
  })

  it('validação, nome único (inclusive contra embutidos) e update', async () => {
    for (const bad of [
      { ...custom, name: ' ' },
      { ...custom, temperature: 2.5 },
      { ...custom, prompt: 'x'.repeat(4001) },
      { ...custom, mediaType: '' },
      { ...custom, mediaType: 'x'.repeat(41) }
    ])
      await expect(svc.create(bad as never)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(svc.create({ ...custom, name: 'Anime' })).rejects.toMatchObject({
      code: 'PRESET_NAME_TAKEN'
    })
    const p = await svc.create(custom)
    await expect(svc.create(custom)).rejects.toMatchObject({ code: 'PRESET_NAME_TAKEN' })
    expect((await svc.update(p.id, { ...custom, temperature: 0.9 })).temperature).toBe(0.9)
    await expect(svc.get('nope')).rejects.toMatchObject({ code: 'PRESET_NOT_FOUND' })
  })

  it('delete recusado com job ativo', async () => {
    const p = await svc.create(custom)
    inUse.add(p.id)
    await expect(svc.delete(p.id)).rejects.toMatchObject({ code: 'PRESET_IN_USE' })
    inUse.clear()
    await svc.delete(p.id)
    await expect(svc.get(p.id)).rejects.toMatchObject({ code: 'PRESET_NOT_FOUND' })
  })
})

describe('export / import', () => {
  const file = (presets: unknown[]): string =>
    JSON.stringify({ format: 'bakasub-presets', version: 1, exportedAt: 'x', presets })

  it('exporta embutidos e personalizados; id inexistente => PRESET_NOT_FOUND', async () => {
    const p = await svc.create(custom)
    const f = await svc.exportPresets(['builtin:anime', p.id])
    expect(f.presets.map((x) => x.name)).toEqual(['Anime', 'Anime: Naruto'])
    await expect(svc.exportPresets(['nope'])).rejects.toMatchObject({ code: 'PRESET_NOT_FOUND' })
    await expect(svc.exportPresets([])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('round-trip: o que sai entra como personalizado novo, com nome livre', async () => {
    const p = await svc.create(custom)
    const text = JSON.stringify(await svc.exportPresets(['builtin:anime', p.id]))
    const r = await svc.importPresets(text)
    expect(r.imported.map((x) => [x.name, x.builtin, x.prompt === '' ? 'empty' : 'ok'])).toEqual([
      ['Anime (imported)', false, 'ok'],
      ['Anime: Naruto (imported)', false, 'ok']
    ])
    expect(r.skipped).toEqual([])
    expect((await svc.importPresets(text)).imported.map((x) => x.name)).toEqual([
      'Anime (imported 2)',
      'Anime: Naruto (imported 2)'
    ])
  })

  it("onConflict 'skip' ignora nomes existentes; repetidos no mesmo arquivo também conflitam", async () => {
    await svc.create(custom)
    const entry = { ...custom }
    const r = await svc.importPresets(
      file([entry, { ...entry, name: 'Novo' }, { ...entry, name: 'Novo' }]),
      { onConflict: 'skip' }
    )
    expect(r.imported.map((x) => x.name)).toEqual(['Novo'])
    expect(r.skipped).toEqual([
      { index: 0, name: 'Anime: Naruto', reason: 'name-taken' },
      { index: 2, name: 'Novo', reason: 'name-taken' }
    ])
  })

  it('entradas inválidas são relatadas e as válidas importadas', async () => {
    const r = await svc.importPresets(
      file([
        { ...custom, temperature: 7 },
        { ...custom, name: 'Ok' }
      ])
    )
    expect(r.imported.map((x) => x.name)).toEqual(['Ok'])
    expect(r.skipped).toEqual([{ index: 0, name: 'Anime: Naruto', reason: 'temperature' }])
  })

  it('arquivo inválido => INVALID_PRESET_FILE e nada é gravado', async () => {
    await expect(svc.importPresets('{')).rejects.toMatchObject({ code: 'INVALID_PRESET_FILE' })
    expect((await svc.list()).filter((p) => !p.builtin)).toEqual([])
  })
})
