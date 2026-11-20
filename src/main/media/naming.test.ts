import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { langFromFilename, outputNames, playerNames, resolveOutputPath, uniquePath } from './naming'

describe('langFromFilename', () => {
  it('sufixo BCP-47 antes da extensão', () => {
    expect(langFromFilename('/x/ep01.pt-BR.ass')).toBe('pt-BR')
    expect(langFromFilename('ep01.en.srt')).toBe('en')
    expect(langFromFilename('Show.S01E01.1080p.WEB.ass')).toBeUndefined()
    expect(langFromFilename('ep01.ass')).toBeUndefined()
    expect(langFromFilename('Show.DUAL.ass')).toBeUndefined()
    expect(langFromFilename('Show.web.ass')).toBeUndefined()
  })
})

describe('outputNames', () => {
  it('mux, legenda solta e extração', () => {
    expect(outputNames.muxed('/v/ep01.mkv', 'pt-BR')).toBe('ep01.pt-BR.mkv')
    expect(outputNames.subtitle('/v/ep01.en.ass', 'pt-BR')).toBe('ep01.pt-BR.ass')
    expect(outputNames.subtitle('/v/ep01.ass', 'pt-BR', 'srt')).toBe('ep01.pt-BR.srt')
    expect(outputNames.extracted('/v/ep01.mkv', 3, 'en', 'ass')).toBe('ep01.3.en.ass')
    expect(outputNames.extracted('/v/ep01.mkv', 3, undefined, 'srt')).toBe('ep01.3.und.srt')
    expect(outputNames.partial('/out/ep01.pt-BR.mkv')).toBe('/out/.ep01.pt-BR.bakasub-partial.mkv')
  })
})

describe('uniquePath', () => {
  it('sufixo (2), (3)… em colisão', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bakasub-name-'))
    expect(await uniquePath(dir, 'a.mkv')).toBe(join(dir, 'a.mkv'))
    writeFileSync(join(dir, 'a.mkv'), '')
    writeFileSync(join(dir, 'a (2).mkv'), '')
    expect(await uniquePath(dir, 'a.mkv')).toBe(join(dir, 'a (3).mkv'))
  })
})

describe('playerNames', () => {
  const t = (
    language: string | undefined,
    format = 'ass'
  ): { language?: string; format: string } => ({ language, format })
  it('uma faixa: <base>.<lang>.<ext>, sem trackId', () => {
    expect(playerNames('/v/ep01.mkv', [t('pt-BR')])).toEqual(['ep01.pt-BR.ass'])
    expect(playerNames('/v/ep01.mkv', [t(undefined, 'srt')])).toEqual(['ep01.und.srt'])
  })
  it('idiomas diferentes não ganham número', () => {
    expect(playerNames('/v/ep01.mkv', [t('en'), t('pt-BR', 'srt')])).toEqual([
      'ep01.en.ass',
      'ep01.pt-BR.srt'
    ])
  })
  it('mesmo idioma: <lang>.<n> pela ordem, nunca o mesmo nome', () => {
    const names = playerNames('/v/ep01.mkv', [t('en'), t('pt'), t('en'), t('en')])
    expect(names).toEqual(['ep01.en.1.ass', 'ep01.pt.ass', 'ep01.en.2.ass', 'ep01.en.3.ass'])
    expect(new Set(names).size).toBe(names.length)
  })
  it('remove sufixo de idioma já presente no vídeo', () => {
    expect(playerNames('/v/ep01.en.mkv', [t('pt-BR')])).toEqual(['ep01.pt-BR.ass'])
  })
})

describe('resolveOutputPath', () => {
  it('colisão: (2) por padrão; overwrite usa o nome exato, menos a própria origem', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bakasub-out-'))
    writeFileSync(join(dir, 'a.ass'), '')
    expect(await resolveOutputPath(dir, 'a.ass')).toBe(join(dir, 'a (2).ass'))
    expect(await resolveOutputPath(dir, 'a.ass', { overwrite: true })).toBe(join(dir, 'a.ass'))
    expect(
      await resolveOutputPath(dir, 'a.ass', { overwrite: true, protect: join(dir, 'a.ass') })
    ).toBe(join(dir, 'a (2).ass'))
    expect(await resolveOutputPath(dir, 'b.ass')).toBe(join(dir, 'b.ass'))
  })
})
