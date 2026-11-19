import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Profile } from '../../shared/ipc-contract'
import { resolveJobSpec } from './job-spec'

let dir: string
const profile: Profile = {
  id: 7,
  name: 'P',
  model: 'a/b',
  glossary: [{ source: 'senpai', rule: 'keep' }],
  targetLang: 'pt-BR',
  temperature: 0.3,
  createdAt: new Date(0).toISOString()
}
const profiles = {
  get: async (id: number): Promise<Profile> => {
    if (id !== 7) throw Object.assign(new Error('nf'), { code: 'PROFILE_NOT_FOUND' })
    return profile
  }
}
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bakasub-spec-'))
  writeFileSync(join(dir, 'ep01.mkv'), 'mkv')
  writeFileSync(join(dir, 'ep01.en.srt'), 'srt')
  writeFileSync(join(dir, 'ep01.pt-BR.ass'), 'ass')
  mkdirSync(join(dir, 'out'))
})

describe('resolveJobSpec', () => {
  it('translate: copia o perfil, idioma padrão do perfil, sourceLang do nome, saída ao lado', async () => {
    const s = await resolveJobSpec(
      { kind: 'translate', source: join(dir, 'ep01.en.srt'), profileId: 7 },
      profiles
    )
    expect(s).toEqual({
      kind: 'translate',
      source: join(dir, 'ep01.en.srt'),
      sourceSize: 3,
      profile: { id: 7, name: 'P', model: 'a/b', glossary: profile.glossary, temperature: 0.3 },
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
        profileId: 7,
        targetLang: 'es-419',
        sourceLang: 'EN',
        outputDir: join(dir, 'out')
      },
      profiles
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
      profiles
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
      profiles
    )
    expect(s).toMatchObject({ kind: 'extract', trackIds: [2, 3] })
    await expect(
      resolveJobSpec({ kind: 'extract', source: join(dir, 'ep01.mkv'), trackIds: [] }, profiles)
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('caminhos inválidos: extensão errada para o tipo, relativo, pasta de saída inexistente', async () => {
    await expect(
      resolveJobSpec({ kind: 'translate', source: join(dir, 'ep01.mkv'), profileId: 7 }, profiles)
    ).rejects.toMatchObject({ code: 'INVALID_PATH' })
    await expect(
      resolveJobSpec({ kind: 'extract', source: 'ep01.mkv', trackIds: [1] }, profiles)
    ).rejects.toMatchObject({ code: 'INVALID_PATH' })
    await expect(
      resolveJobSpec(
        {
          kind: 'extract',
          source: join(dir, 'ep01.mkv'),
          trackIds: [1],
          outputDir: join(dir, 'nope')
        },
        profiles
      )
    ).rejects.toMatchObject({ code: 'INVALID_PATH' })
  })

  it('forma inválida e idioma inválido => INVALID_INPUT', async () => {
    await expect(resolveJobSpec({ kind: 'nope' } as never, profiles)).rejects.toMatchObject({
      code: 'INVALID_INPUT'
    })
    await expect(
      resolveJobSpec(
        { kind: 'translate', source: join(dir, 'ep01.en.srt'), profileId: 7, targetLang: 'xx yy' },
        profiles
      )
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
