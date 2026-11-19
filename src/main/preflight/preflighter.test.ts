import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JobMemoryRepository } from '../database/repositories/job-memory.repository'
import { openTestDatabase } from '../database/test-db'
import type { ModelInfo } from '../llm/model-catalog'
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
    expect(r.estimate.lines).toEqual({ total: 1, cached: 0, toTranslate: 1, chunks: 1 })
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
})
