import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { openTestDatabase } from '../database/test-db'
import { PreferencesService } from './preferences.service'
import { SettingsService } from './settings.service'

let t: Awaited<ReturnType<typeof openTestDatabase>>
let settings: SettingsService
let onChanged: ReturnType<typeof vi.fn<(keys: string[]) => void>>
let prefs: PreferencesService
const presetExists = vi.fn(async (id: string) => id.startsWith('builtin:') || id === 'custom-1')

beforeEach(async () => {
  t = await openTestDatabase()
  settings = new SettingsService(new SettingsRepository(t.db))
  onChanged = vi.fn<(keys: string[]) => void>()
  prefs = new PreferencesService({ settings, presetExists, onChanged })
})
afterEach(() => t.close())

const code = async (p: Promise<unknown>): Promise<string | undefined> =>
  p.then(
    () => undefined,
    (e: { code?: string }) => e.code
  )

describe('PreferencesService', () => {
  it('snapshot: only public keys, with defaults (no default model or language)', async () => {
    const s = await prefs.snapshot()
    expect(s).toEqual({
      'translation.defaultModel': null,
      'translation.defaultTargetLang': null,
      'translation.defaultPresetId': 'builtin:series',
      'translation.targetLangs': [],
      'models.favorites': [],
      'jobs.concurrency': 2,
      'preflight.autoConfirmBelowUsd': null,
      'tracks.preferredSourceLangs': ['en'],
      'logs.level': 'info',
      'llm.rateLimit.freeRpm': 20,
      'llm.rateLimit.paidRpm': null,
      'llm.rateLimit.freeTier': 'auto',
      'llm.retry.maxThrottled': 5,
      'llm.retry.maxTransient': 3,
      'llm.retry.baseDelayMs': 1000,
      'llm.retry.maxDelayMs': 30_000,
      'llm.retry.chunkRounds': 2
    })
    expect(s).not.toHaveProperty('models.cache')
  })

  it('making a model the default also stars it', async () => {
    const s = await prefs.update({ 'translation.defaultModel': 'google/gemini-2.5-flash' })
    expect(s['models.favorites']).toEqual(['google/gemini-2.5-flash'])
    expect(await settings.get('models.favorites')).toEqual(['google/gemini-2.5-flash'])
  })

  it('un-starring the default model is a conflict and changes nothing', async () => {
    await prefs.update({ 'translation.defaultModel': 'a/x', 'models.favorites': ['a/x', 'b/y'] })
    expect(await code(prefs.update({ 'models.favorites': ['b/y'] }))).toBe('SETTINGS_CONFLICT')
    expect((await prefs.snapshot())['models.favorites']).toEqual(['a/x', 'b/y'])
  })

  it('changing the default and dropping the old one in the same patch is fine', async () => {
    await prefs.update({ 'translation.defaultModel': 'a/x' })
    const s = await prefs.update({ 'translation.defaultModel': 'b/y', 'models.favorites': ['b/y'] })
    expect(s['models.favorites']).toEqual(['b/y'])
  })

  it('target languages are canonicalized and deduplicated; the default joins the list', async () => {
    const s = await prefs.update({
      'translation.targetLangs': ['pt-br', 'es', 'pt-BR'],
      'translation.defaultTargetLang': 'ja'
    })
    expect(s['translation.targetLangs']).toEqual(['pt-BR', 'es', 'ja'])
    expect(s['translation.defaultTargetLang']).toBe('ja')
  })

  it('removing the default language is a conflict', async () => {
    await prefs.update({
      'translation.defaultTargetLang': 'pt-BR',
      'translation.targetLangs': ['pt-BR', 'es']
    })
    expect(await code(prefs.update({ 'translation.targetLangs': ['es'] }))).toBe(
      'SETTINGS_CONFLICT'
    )
  })

  it('invalid values and unknown or internal keys are INVALID_INPUT', async () => {
    expect(await code(prefs.update({ 'jobs.concurrency': 9 }))).toBe('INVALID_INPUT')
    expect(await code(prefs.update({ 'translation.targetLangs': ['not a tag!'] }))).toBe(
      'INVALID_INPUT'
    )
    expect(await code(prefs.update({ 'models.cache': null } as never))).toBe('INVALID_INPUT')
  })

  it('default preset must exist', async () => {
    expect(await code(prefs.update({ 'translation.defaultPresetId': 'gone' }))).toBe(
      'PRESET_NOT_FOUND'
    )
    expect(
      (await prefs.update({ 'translation.defaultPresetId': 'custom-1' }))[
        'translation.defaultPresetId'
      ]
    ).toBe('custom-1')
  })

  it('reports which keys actually changed', async () => {
    await prefs.update({ 'jobs.concurrency': 3, 'tracks.preferredSourceLangs': ['en'] })
    expect(onChanged).toHaveBeenCalledWith(['jobs.concurrency'])
    onChanged.mockClear()
    await prefs.update({ 'jobs.concurrency': 3 })
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('retry: base delay above the maximum is a conflict', async () => {
    expect(
      await code(prefs.update({ 'llm.retry.baseDelayMs': 5000, 'llm.retry.maxDelayMs': 2000 }))
    ).toBe('SETTINGS_CONFLICT')
    expect(await code(prefs.update({ 'llm.rateLimit.freeRpm': 0 }))).toBe('INVALID_INPUT')
  })

  it('reset restores factory defaults for the given keys only', async () => {
    await prefs.update({
      'llm.rateLimit.freeRpm': 10,
      'llm.retry.chunkRounds': 0,
      'jobs.concurrency': 3
    })
    onChanged.mockClear()
    const s = await prefs.reset(['llm.rateLimit.freeRpm', 'llm.retry.chunkRounds'])
    expect(s['llm.rateLimit.freeRpm']).toBe(20)
    expect(s['llm.retry.chunkRounds']).toBe(2)
    expect(s['jobs.concurrency']).toBe(3)
    expect(onChanged).toHaveBeenCalledWith(['llm.rateLimit.freeRpm', 'llm.retry.chunkRounds'])
    expect(await code(prefs.reset(['models.cache']))).toBe('INVALID_INPUT')
  })
})
