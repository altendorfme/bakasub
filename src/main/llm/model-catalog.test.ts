import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { openTestDatabase } from '../database/test-db'
import { SettingsService } from '../settings/settings.service'
import { ModelCatalog, parseModel } from './model-catalog'
import { LlmError } from './openrouter-client'

const HOUR = 3_600_000
const raw = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  name: `Model ${id}`,
  context_length: 128000,
  pricing: { prompt: '0.000001', completion: '0.000002' },
  supported_parameters: ['temperature', 'max_tokens', 'response_format', 'structured_outputs'],
  top_provider: { context_length: 128000, max_completion_tokens: 16384, is_moderated: false },
  architecture: { output_modalities: ['text'] },
  ...over
})

describe('parseModel', () => {
  it('extrai capacidades, preço (USD/token) e moderação', () => {
    expect(parseModel(raw('a/b'))).toEqual({
      id: 'a/b',
      name: 'Model a/b',
      contextLength: 128000,
      maxCompletionTokens: 16384,
      isModerated: false,
      pricing: { prompt: 0.000001, completion: 0.000002 },
      structuredOutputs: true,
      responseFormat: true
    })
  })
  it('preço dinâmico (-1) => null; campos ausentes tolerados', () => {
    const m = parseModel({ id: 'r/auto', pricing: { prompt: '-1', completion: '-1' } })
    expect(m).toMatchObject({ pricing: null, structuredOutputs: false, isModerated: false })
  })
  it('item sem id => null', () => {
    expect(parseModel({ name: 'x' })).toBeNull()
  })
})

describe('ModelCatalog', () => {
  let t: Awaited<ReturnType<typeof openTestDatabase>>
  let settings: SettingsService
  let now: number
  beforeEach(async () => {
    t = await openTestDatabase()
    settings = new SettingsService(new SettingsRepository(t.db))
    now = 1000 * HOUR
  })
  afterEach(() => t.close())

  const catalog = (list: () => Promise<unknown[]>): ModelCatalog =>
    new ModelCatalog({ listModels: list }, settings, { now: () => now })

  it('busca, guarda e reusa dentro do TTL', async () => {
    const list = vi.fn(async () => [raw('a/b'), { bad: true }])
    const c = catalog(list)
    expect((await c.get()).models.map((m) => m.id)).toEqual(['a/b'])
    now += 23 * HOUR
    const r = await catalog(list).get()
    expect(r).toMatchObject({ offline: false, fetchedAt: 1000 * HOUR })
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('TTL vencido => refetch', async () => {
    const list = vi.fn(async () => [raw('a/b')])
    await catalog(list).get()
    now += 25 * HOUR
    await catalog(list).get()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('falha de rede com cache vencido => cache com offline: true', async () => {
    await catalog(async () => [raw('a/b')]).get()
    now += 48 * HOUR
    const r = await catalog(async () => {
      throw new LlmError('network', 'down')
    }).get()
    expect(r).toMatchObject({ offline: true, fetchedAt: 1000 * HOUR })
    expect(r.models).toHaveLength(1)
  })

  it('falha sem cache nenhum => propaga', async () => {
    await expect(
      catalog(async () => {
        throw new LlmError('network', 'down')
      }).get()
    ).rejects.toBeInstanceOf(LlmError)
  })

  it('cache de versão antiga (sem reasoning) conta como vencido, mas serve offline', async () => {
    await settings.set('models.cache', { fetchedAt: now, models: [parseModel(raw('a/b'))] })
    const list = vi.fn(async () => [
      raw('a/b', {
        supported_parameters: ['reasoning'],
        reasoning: { mandatory: false }
      })
    ])
    const r = await catalog(list).get()
    expect(list).toHaveBeenCalledTimes(1)
    expect(r.models[0].reasoning).toEqual({ mandatory: false, supportsMaxTokens: false })
    // Relido do cache novo (v2) com o campo preservado.
    const again = await catalog(list).get()
    expect(list).toHaveBeenCalledTimes(1)
    expect(again.models[0].reasoning).toEqual({ mandatory: false, supportsMaxTokens: false })

    await settings.set('models.cache', { fetchedAt: now, models: [parseModel(raw('a/b'))] })
    const off = await catalog(async () => {
      throw new LlmError('network', 'down')
    }).get()
    expect(off).toMatchObject({ offline: true })
    expect(off.models[0].reasoning).toBeUndefined()
  })

  it('find: modelo ausente no cache fresco força um refetch antes de desistir', async () => {
    const list = vi
      .fn<() => Promise<unknown[]>>()
      .mockResolvedValueOnce([raw('a/b')])
      .mockResolvedValueOnce([raw('a/b'), raw('novo/m')])
    const c = catalog(list)
    await c.get()
    expect((await c.find('novo/m'))?.id).toBe('novo/m')
    expect(await c.find('nao/existe')).toBeNull()
    expect(list).toHaveBeenCalledTimes(3)
  })
})
