import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JobMemoryRepository } from '../database/repositories/job-memory.repository'
import { openTestDatabase } from '../database/test-db'
import type { ModelInfo } from '../llm/model-catalog'
import type { ChatRequest } from '../llm/openrouter-client'
import { translateDocument } from '../llm/translate-document'
import { JobMemoryService } from '../memory/job-memory.service'
import { srtFormat } from '../parsers/srt'
import { Preflighter } from './preflighter'

const MODEL: ModelInfo = {
  id: 'a/b',
  name: 'A',
  contextLength: null,
  maxCompletionTokens: null,
  isModerated: false,
  pricing: { prompt: 0.000001, completion: 0.000002 },
  structuredOutputs: false,
  responseFormat: true,
  tokenizer: 'GPT'
}
const doc = srtFormat.parse(
  '1\n00:00:01,000 --> 00:00:02,000\nHello there my friend.\n\n2\n00:00:03,000 --> 00:00:04,000\n♪♪\n'
)

let t: Awaited<ReturnType<typeof openTestDatabase>>
let memory: JobMemoryService
beforeEach(async () => {
  t = await openTestDatabase()
  memory = new JobMemoryService(new JobMemoryRepository(t.db))
})
afterEach(() => t.close())

const pf = (find = async (id: string) => (id === 'a/b' ? MODEL : null)): Preflighter =>
  new Preflighter({
    models: { find, get: async () => ({ models: [MODEL], fetchedAt: 5, offline: false }) },
    memory
  })

describe('Preflighter', () => {
  it('estimativa + cobertura (o que não vai ao LLM)', async () => {
    const r = await pf().run({
      doc,
      format: srtFormat,
      preset: { model: 'a/b', glossary: [], temperature: 0.3, prompt: '' },
      targetLang: 'pt-BR'
    })
    expect(r.estimate.lines).toEqual({ total: 1, cached: 0, toTranslate: 1, copies: 0, chunks: 1 })
    expect(r.estimate.model.catalogFetchedAt).toBe(new Date(5).toISOString())
    expect(r.coverage.byReason).toEqual({ SKIPPED_NO_LETTERS: 1 })
  })
  it('modelo fora do catálogo: LLM_UNKNOWN_MODEL', async () => {
    await expect(
      pf().run({
        doc,
        format: srtFormat,
        preset: { model: 'x/y', glossary: [], temperature: 0.3, prompt: '' },
        targetLang: 'pt-BR'
      })
    ).rejects.toMatchObject({ code: 'LLM_UNKNOWN_MODEL' })
  })

  it('modelo free: compara as requisições previstas com a cota diária', async () => {
    const free = { ...MODEL, id: 'a/b:free' }
    const run = (remaining: number | null): ReturnType<Preflighter['run']> =>
      new Preflighter({
        models: {
          find: async () => free,
          get: async () => ({ models: [free], fetchedAt: 5, offline: false })
        },
        memory,
        freeQuota: {
          status: async () => ({
            tier: 'under-10',
            source: 'auto',
            limit: 50,
            used: remaining === null ? null : 50 - remaining,
            remaining
          })
        }
      }).run({
        doc,
        format: srtFormat,
        preset: { model: 'a/b:free', glossary: [], temperature: 0.3, prompt: '' },
        targetLang: 'pt-BR'
      })
    expect((await run(10)).estimate.freeQuota).toMatchObject({ requests: 2, enough: true })
    expect((await run(1)).estimate.freeQuota).toMatchObject({ requests: 2, enough: false })
    expect((await run(null)).estimate.freeQuota).toMatchObject({ enough: null })
  })

  it('modelo pago: nada de cota', async () => {
    const r = await new Preflighter({
      models: {
        find: async () => MODEL,
        get: async () => ({ models: [MODEL], fetchedAt: 5, offline: false })
      },
      memory,
      freeQuota: {
        status: async () => {
          throw new Error('não deveria consultar')
        }
      }
    }).run({
      doc,
      format: srtFormat,
      preset: { model: 'a/b', glossary: [], temperature: 0.3, prompt: '' },
      targetLang: 'pt-BR'
    })
    expect(r.estimate.freeQuota).toBeUndefined()
  })
})

describe('Preflighter e translateDocument: mesma chave do Job Memory', () => {
  const preset = { model: 'a/b', glossary: [], temperature: 0.3, prompt: 'Anime' }
  const calls: ChatRequest[] = []
  const translate = (mediaScope?: string): ReturnType<typeof translateDocument> =>
    translateDocument(
      {
        doc,
        format: srtFormat,
        preset,
        targetLang: 'pt-BR',
        ...(mediaScope ? { mediaScope } : {})
      },
      {
        llm: {
          chat: async (req) => {
            calls.push(req)
            const user = req.messages.find((m) => m.role === 'user')!.content
            const ids = [...user.slice(user.indexOf('<target>')).matchAll(/<line id="(\d+)">/g)]
            return {
              content: JSON.stringify(
                Object.fromEntries(ids.map((m) => [m[1], 'Olá, meu amigo.']))
              ),
              finishReason: 'stop',
              generationId: 'g',
              usage: { promptTokens: 1, completionTokens: 1, cachedTokens: 0, cost: 0 }
            }
          },
          generationCost: async () => null
        },
        memory,
        models: { find: async () => MODEL },
        random: () => 1,
        sleep: async () => undefined
      }
    )
  const cached = async (mediaScope?: string): Promise<number> =>
    (
      await pf().run({
        doc,
        format: srtFormat,
        preset,
        targetLang: 'pt-BR',
        ...(mediaScope ? { mediaScope } : {})
      })
    ).estimate.lines.cached

  it('o preflight prevê o hit que o job dá; outra obra é miss e outra chamada ao LLM', async () => {
    calls.length = 0
    await translate('tmdb:series:1')
    expect(await cached('tmdb:series:1')).toBe(1)
    expect(await cached('tmdb:series:2')).toBe(0)
    expect(await cached()).toBe(0)

    expect((await translate('tmdb:series:1')).cache).toEqual({ hits: 1, misses: 0 })
    expect(calls).toHaveLength(1)
    expect((await translate('tmdb:series:2')).cache).toEqual({ hits: 0, misses: 1 })
    expect(calls).toHaveLength(2)
    expect((await memory.stats()).rows).toBe(2)
  })

  it("memory 'skip': 0 hits e o mesmo custo cheio de um cache vazio", async () => {
    const run = (memoryMode?: 'use' | 'skip'): ReturnType<Preflighter['run']> =>
      pf().run({
        doc,
        format: srtFormat,
        preset,
        targetLang: 'pt-BR',
        ...(memoryMode ? { memory: memoryMode } : {})
      })
    const cold = (await run()).estimate
    expect(cold.memory).toBe('use')
    await translate()
    const warm = (await run('use')).estimate
    expect(warm.lines.cached).toBe(1)
    expect(warm.cost).toEqual({ low: 0, high: 0 })

    const skipped = (await run('skip')).estimate
    expect(skipped.memory).toBe('skip')
    expect(skipped.lines).toEqual({ ...cold.lines, cached: 0 })
    expect(skipped.tokens).toEqual(cold.tokens)
    expect(skipped.cost).toEqual(cold.cost)
    expect(skipped.cost!.high).toBeGreaterThan(0)
  })
})
