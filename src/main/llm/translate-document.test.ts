import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobMemoryRepository } from '../database/repositories/job-memory.repository'
import { openTestDatabase } from '../database/test-db'
import { JobMemoryService } from '../memory/job-memory.service'
import { analyzeCoverage, type SubtitleDocument } from '../parsers'
import { srtFormat } from '../parsers/srt'
import type { ModelInfo } from './model-catalog'
import { LlmError, type ChatRequest, type ChatResult } from './openrouter-client'
import { TranslationCancelled, translateDocument, type TranslateDeps } from './translate-document'

const MODEL: ModelInfo = {
  id: 'a/b',
  name: 'A',
  contextLength: 100_000,
  maxCompletionTokens: 8000,
  isModerated: false,
  pricing: { prompt: 0, completion: 0 },
  structuredOutputs: true,
  responseFormat: true
}

const srt = (...lines: string[]): SubtitleDocument<unknown> =>
  srtFormat.parse(
    lines
      .map((t, i) => {
        const s = String(i + 1).padStart(2, '0')
        return `${i + 1}\n00:00:${s},000 --> 00:00:${s},500\n${t}\n`
      })
      .join('\n')
  )

/** Linhas pedidas em <target> (traduzir) ou em <source> (reparo). */
function targetLines(req: ChatRequest): Map<number, string> {
  const user = req.messages.find((m) => m.role === 'user')!.content
  const target = user.slice(user.indexOf('<target>'))
  const out = new Map<number, string>()
  for (const m of target.matchAll(/<line id="(\d+)">\n<source>(.*)<\/source>/g))
    out.set(Number(m[1]), m[2])
  if (out.size === 0)
    for (const m of target.matchAll(/<line id="(\d+)">(.*)<\/line>/g)) out.set(Number(m[1]), m[2])
  return out
}
const tr = (payload: string): string => `PT ${payload}`
const ok = (content: string, finishReason = 'stop'): ChatResult => ({
  content,
  finishReason,
  generationId: 'gen-x',
  usage: { promptTokens: 10, completionTokens: 5, cachedTokens: 2, cost: 0.001 }
})
const echo = (req: ChatRequest): ChatResult =>
  ok(JSON.stringify(Object.fromEntries([...targetLines(req)].map(([id, p]) => [id, tr(p)]))))

let t: Awaited<ReturnType<typeof openTestDatabase>>
let memory: JobMemoryService
beforeEach(async () => {
  t = await openTestDatabase()
  memory = new JobMemoryService(new JobMemoryRepository(t.db))
})
afterEach(() => t.close())

function deps(
  chat: (req: ChatRequest, call: number) => ChatResult | Promise<ChatResult>,
  over: Partial<TranslateDeps> = {}
): TranslateDeps & { calls: ChatRequest[]; sleep: ReturnType<typeof vi.fn> } {
  const calls: ChatRequest[] = []
  const sleep = vi.fn(async () => undefined)
  return {
    calls,
    sleep,
    llm: {
      chat: async (req: ChatRequest) => {
        calls.push(req)
        return chat(req, calls.length)
      },
      generationCost: async () => ({ cost: 0.05, promptTokens: 1, completionTokens: 1 })
    },
    memory,
    models: { find: async (id: string) => (id === MODEL.id ? MODEL : null) },
    random: () => 1,
    ...over,
    ...(over.sleep ? {} : { sleep })
  } as TranslateDeps & { calls: ChatRequest[]; sleep: ReturnType<typeof vi.fn> }
}

const input = (
  doc: SubtitleDocument<unknown>,
  over: Record<string, unknown> = {}
): Parameters<typeof translateDocument<unknown>>[0] => ({
  doc,
  format: srtFormat,
  profile: { model: 'a/b', glossary: [], temperature: 0.3 },
  targetLang: 'pt-BR',
  ...over
})

describe('translateDocument', () => {
  it('traduz, preserva tags e grava no Job Memory; reprocessar não chama o LLM', async () => {
    const doc = srt('Hello <i>world</i>, how are you?', 'Fine.')
    const d = deps(echo)
    const r = await translateDocument(input(doc), d)
    expect(r.status).toBe('completed')
    expect(srtFormat.serialize(r.doc as never)).toContain('PT Hello <i>world</i>, how are you?')
    expect(r.cache).toEqual({ hits: 0, misses: 2 })
    expect(r.usage).toMatchObject({
      requests: 1,
      promptTokens: 10,
      cost: 0.001,
      costIncomplete: false
    })

    const d2 = deps(echo)
    const r2 = await translateDocument(input(doc), d2)
    expect(d2.calls).toHaveLength(0)
    expect(r2.cache).toEqual({ hits: 2, misses: 0 })
    expect(srtFormat.serialize(r2.doc as never)).toBe(srtFormat.serialize(r.doc as never))
  })

  it('pede json_schema estrito com require_parameters; json_object como fallback; nada sem suporte', async () => {
    const doc = srt('Hello there my friend.')
    const d = deps(echo)
    await translateDocument(input(doc), d)
    expect(d.calls[0].responseFormat).toMatchObject({ type: 'json_schema' })
    expect(d.calls[0].requireParameters).toBe(true)

    for (const [m, expected] of [
      [{ ...MODEL, structuredOutputs: false }, { type: 'json_object' }],
      [{ ...MODEL, structuredOutputs: false, responseFormat: false }, undefined]
    ] as const) {
      const t2 = await openTestDatabase()
      const d2 = deps(echo, {
        memory: new JobMemoryService(new JobMemoryRepository(t2.db)),
        models: { find: async () => m }
      })
      await translateDocument(input(doc), d2)
      expect(d2.calls[0].responseFormat).toEqual(expected)
      t2.close()
    }
  })

  it('modelo desconhecido: LLM_UNKNOWN_MODEL sem chamar o LLM', async () => {
    const d = deps(echo)
    await expect(
      translateDocument(
        input(srt('Hello there.'), { profile: { model: 'x/y', glossary: [], temperature: 0.3 } }),
        d
      )
    ).rejects.toMatchObject({ code: 'LLM_UNKNOWN_MODEL' })
    expect(d.calls).toHaveLength(0)
  })

  it('aceita as válidas e repara só as inválidas, com os problemas no prompt', async () => {
    const doc = srt('One <i>two</i> three four.', 'Five six seven eight.')
    const d = deps((req, call) => {
      if (call === 1) return ok(JSON.stringify({ '1': 'PT one two three four.', '2': 'PT five' }))
      return echo(req)
    })
    const r = await translateDocument(input(doc), d)
    expect(d.calls).toHaveLength(2)
    const repair = d.calls[1].messages[1].content
    expect(repair).toContain('<g1>…</g1> is missing')
    expect([...targetLines(d.calls[1]).keys()]).toEqual([1])
    expect(r.status).toBe('completed')
    expect(srtFormat.serialize(r.doc as never)).toContain('PT five')
  })

  it('3 tentativas esgotadas: linha fica no original e vira UNTRANSLATED_VALIDATION_FAILED', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Line number ${i} is <i>here</i>.`)
    const doc = srt(...lines)
    const d = deps((req) => {
      const out = Object.fromEntries(
        [...targetLines(req)].map(([id, p]) => [id, id === 3 ? 'broken' : tr(p)])
      )
      return ok(JSON.stringify(out))
    })
    const r = await translateDocument(input(doc), d)
    expect(d.calls).toHaveLength(3)
    expect(r.status).toBe('completed-with-warnings')
    expect(r.failed).toEqual([
      expect.objectContaining({ cueId: 3, reason: 'UNTRANSLATED_VALIDATION_FAILED' })
    ])
    expect(srtFormat.serialize(r.doc as never)).toContain('Line number 2 is <i>here</i>.')
    const cov = analyzeCoverage(r.doc, { failures: r.failed })
    expect(cov.byReason).toEqual({ UNTRANSLATED_VALIDATION_FAILED: 1 })
  })

  it('JSON ilegível repete o chunk inteiro com o prompt de tradução', async () => {
    const d = deps((req, call) => (call === 1 ? ok('desculpe, não sei') : echo(req)))
    const r = await translateDocument(input(srt('Hello there friend.', 'Bye now friend.')), d)
    expect(d.calls).toHaveLength(2)
    expect(d.calls[1].messages[1].content).not.toContain('<problems>')
    expect(r.status).toBe('completed')
  })

  it('finish_reason length divide o chunk ao meio', async () => {
    const d = deps((req, call) => (call === 1 ? ok('{"1":"PT', 'length') : echo(req)))
    const r = await translateDocument(
      input(srt('Aa bb cc dd.', 'Ee ff gg hh.', 'Ii jj kk ll.', 'Mm nn oo pp.')),
      d
    )
    expect(d.calls.map((c) => [...targetLines(c).keys()])).toEqual([
      [1, 2, 3, 4],
      [1, 2],
      [3, 4]
    ])
    expect(r.status).toBe('completed')
  })

  it('moderação: divide até isolar; linha bloqueada vira CONTENT_FILTERED e não conta para o limite', async () => {
    const d = deps((req) => {
      if (targetLines(req).has(3)) throw new LlmError('moderation', 'blocked')
      return echo(req)
    })
    const r = await translateDocument(
      input(srt('Aa bb cc dd.', 'Ee ff gg hh.', 'Ii jj kk ll.', 'Mm nn oo pp.')),
      d
    )
    expect(r.failed).toEqual([
      expect.objectContaining({ cueId: 3, reason: 'UNTRANSLATED_CONTENT_FILTERED' })
    ])
    expect(r.status).toBe('completed-with-warnings')
    expect(srtFormat.serialize(r.doc as never)).toContain('PT Mm nn oo pp.')
  })

  it('429 respeita Retry-After e depois segue', async () => {
    const d = deps((req, call) => {
      if (call === 1) throw new LlmError('rate-limit', 'slow down', { retryAfterMs: 3000 })
      return echo(req)
    })
    const r = await translateDocument(input(srt('Hello there friend.')), d)
    expect(d.sleep).toHaveBeenCalledWith(3000, undefined)
    expect(r.usage.requests).toBe(1)
  })

  it('401 falha o job com LLM_AUTH', async () => {
    const d = deps(() => {
      throw new LlmError('auth', 'bad key', { status: 401 })
    })
    await expect(translateDocument(input(srt('Hello there friend.')), d)).rejects.toMatchObject({
      code: 'LLM_AUTH'
    })
  })

  it('transitório esgotado => LLM_UNAVAILABLE; custo das gerações interrompidas é consultado', async () => {
    const d = deps(() => {
      throw new LlmError('stream-error', 'died', { generationId: 'gen-1' })
    })
    const err = await translateDocument(input(srt('Hello there friend.')), d).catch((e) => e)
    expect(err).toMatchObject({ code: 'LLM_UNAVAILABLE' })
    expect(d.calls).toHaveLength(3)
  })

  it('cancelamento: TranslationCancelled com o custo do /generation e o que já foi gravado', async () => {
    const ac = new AbortController()
    const lines = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} goes here.`)
    const d = deps((req, call) => {
      if (call === 2) {
        ac.abort()
        throw new LlmError('aborted', 'aborted', { generationId: 'gen-2' })
      }
      return echo(req)
    })
    const err = await translateDocument(input(srt(...lines)), d, { signal: ac.signal }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(TranslationCancelled)
    expect(err.code).toBe('CANCELLED')
    expect(err.usage).toMatchObject({ requests: 1, cost: 0.001 + 0.05, costIncomplete: false })
    expect((await memory.stats()).rows).toBe(40)
  })

  it('mais de 10% esgotado: para cedo com LLM_TOO_MANY_FAILURES', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} goes here.`)
    const d = deps(() => ok('{}'))
    await expect(translateDocument(input(srt(...lines)), d)).rejects.toMatchObject({
      code: 'LLM_TOO_MANY_FAILURES'
    })
    expect(d.calls).toHaveLength(3) // o primeiro chunk já estoura o limite
  })

  it('sequencial: o 2º chunk recebe no contexto as traduções do 1º; hits do cache também', async () => {
    const lines = Array.from({ length: 45 }, (_, i) => `Sentence number ${i} goes here.`)
    const d = deps(echo)
    await translateDocument(input(srt(...lines)), d)
    expect(d.calls).toHaveLength(2)
    const second = d.calls[1].messages[1].content
    expect(second).toContain('<translation>PT Sentence number 39 goes here.</translation>')
    expect(second.match(/<translation>/g)).toHaveLength(5)
  })

  it('progresso por chunk', async () => {
    const lines = Array.from({ length: 45 }, (_, i) => `Sentence number ${i} goes here.`)
    const events: unknown[] = []
    await translateDocument(input(srt(...lines)), deps(echo), { onProgress: (p) => events.push(p) })
    expect(events).toEqual([
      expect.objectContaining({ phase: 'lookup', done: 0, total: 45, cached: 0 }),
      expect.objectContaining({ phase: 'translating', done: 40, chunk: { index: 1, count: 2 } }),
      expect.objectContaining({ phase: 'translating', done: 45, chunk: { index: 2, count: 2 } })
    ])
  })

  it('glossário vai no System Prompt; max_tokens proporcional e limitado pelo modelo', async () => {
    const d = deps(echo)
    await translateDocument(
      input(srt('Hello senpai, how are you?'), {
        profile: {
          model: 'a/b',
          glossary: [{ source: 'senpai', rule: 'keep it' }],
          temperature: 0.7
        }
      }),
      d
    )
    expect(d.calls[0].messages[0].content).toContain('1. "senpai": keep it')
    expect(d.calls[0].temperature).toBe(0.7)
    expect(d.calls[0].maxTokens).toBeGreaterThanOrEqual(256)
    expect(d.calls[0].maxTokens).toBeLessThanOrEqual(8000)
  })
})
