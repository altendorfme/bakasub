import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobMemoryRepository } from '../database/repositories/job-memory.repository'
import { openTestDatabase } from '../database/test-db'
import { JobMemoryService } from '../memory/job-memory.service'
import { analyzeCoverage, type SubtitleDocument } from '../parsers'
import { srtFormat } from '../parsers/srt'
import type { ModelInfo } from './model-catalog'
import { LlmError, type ChatRequest, type ChatResult } from './openrouter-client'
import { RateLimiter } from './rate-limiter'
import {
  DEFAULT_RETRY_SETTINGS,
  TranslationCancelled,
  translateDocument,
  type TranslateDeps,
  type TranslateProgress
} from './translate-document'

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
  // Relógio virtual: `sleep` avança o tempo (o limitador depende disso para sair do cooldown).
  let t = 1_000_000
  const sleep = vi.fn(async (ms: number) => {
    t += ms
  })
  return {
    calls,
    sleep,
    now: () => t,
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
  preset: { model: 'a/b', glossary: [], temperature: 0.3, prompt: '' },
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
        input(srt('Hello there.'), {
          preset: { model: 'x/y', glossary: [], temperature: 0.3, prompt: '' }
        }),
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
    expect(d.sleep).toHaveBeenCalledWith(3000, expect.any(AbortSignal))
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

  it('transitório esgotado => 2 rodadas extras do chunk (60 s, 120 s), depois LLM_UNAVAILABLE', async () => {
    const d = deps(() => {
      throw new LlmError('stream-error', 'died', { generationId: 'gen-1' })
    })
    const err = await translateDocument(input(srt('Hello there friend.')), d).catch((e) => e)
    expect(err).toMatchObject({ code: 'LLM_UNAVAILABLE' })
    expect(d.calls).toHaveLength(9) // 3 tentativas × (1 + 2 rodadas)
    expect(d.sleep).toHaveBeenCalledWith(60_000, expect.any(AbortSignal))
    expect(d.sleep).toHaveBeenCalledWith(120_000, expect.any(AbortSignal))
  })

  it('rodada extra reenvia só as linhas que faltam', async () => {
    const lines = ['Hello there friend.', 'How are you doing today?', 'Fine, thanks a lot.']
    let failing = false
    const d = deps((req, call) => {
      if (call === 1) {
        // Só a 1ª linha volta válida; o reparo das outras esbarra na rede.
        const first = [...targetLines(req)][0]
        failing = true
        return ok(JSON.stringify({ [first[0]]: tr(first[1]) }))
      }
      if (failing && call <= 4) throw new LlmError('network', 'down')
      return echo(req)
    })
    const r = await translateDocument(input(srt(...lines)), d, {})
    expect(r.failed).toEqual([])
    const last = d.calls.at(-1)!
    expect([...targetLines(last).keys()]).toHaveLength(2)
  })

  it('chunkRounds = 0: falha sem rodada extra', async () => {
    const d = deps(
      () => {
        throw new LlmError('network', 'down')
      },
      { retrySettings: async () => ({ ...DEFAULT_RETRY_SETTINGS, chunkRounds: 0 }) }
    )
    await expect(translateDocument(input(srt('Hello there friend.')), d)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE'
    })
    expect(d.calls).toHaveLength(3)
  })

  it('cota diária de modelos free: LLM_DAILY_LIMIT na hora, com o horário do reset', async () => {
    const d = deps(() => {
      throw new LlmError('daily-limit', 'free-models-per-day', {
        status: 429,
        rateLimit: { limit: 50, remaining: 0, resetAtMs: Date.UTC(2026, 0, 2) }
      })
    })
    const err = await translateDocument(input(srt('Hello there friend.')), d).catch((e) => e)
    expect(err).toMatchObject({ code: 'LLM_DAILY_LIMIT' })
    expect(err.message).toContain('2026-01-02T00:00:00.000Z')
    expect(d.calls).toHaveLength(1)
  })

  it('429 põe a faixa em cooldown no limitador compartilhado: outro job também espera', async () => {
    let t = 0
    const sleep = vi.fn(async (ms: number) => {
      t += ms
    })
    const limiter = new RateLimiter({
      config: async () => ({ freeRpm: 100, paidRpm: null }),
      sleep,
      now: () => t
    })
    const a = deps(
      (req, call) => {
        if (call === 1) throw new LlmError('rate-limit', 'slow', { retryAfterMs: 5000 })
        return echo(req)
      },
      { limiter, sleep, now: () => t }
    )
    await translateDocument(input(srt('Hello there friend.')), a)
    expect(limiter.cooldownUntil('free')).toBeNull()
    expect(sleep).toHaveBeenCalledWith(5000, expect.any(AbortSignal))
    // Cooldown ativo => o próximo job espera antes da 1ª requisição.
    limiter.cooldown('free', t + 7000)
    const b = deps(echo, { limiter, sleep, now: () => t })
    const events: TranslateProgress[] = []
    await translateDocument(input(srt('Other line here.')), b, {
      onProgress: (p) => events.push(p)
    })
    expect(sleep).toHaveBeenLastCalledWith(7000, expect.any(AbortSignal))
    expect(events).toContainEqual(
      expect.objectContaining({ waiting: { reason: 'cooldown', untilMs: 7000 + 5000 } })
    )
    expect(events.at(-1)!.waiting).toBeUndefined()
  })

  it('backoff aparece no progresso como waiting e some quando a requisição sai', async () => {
    const d = deps((req, call) => {
      if (call === 1) throw new LlmError('server', 'oops', { status: 500 })
      return echo(req)
    })
    const events: TranslateProgress[] = []
    await translateDocument(input(srt('Hello there friend.')), d, {
      onProgress: (p) => events.push(p)
    })
    const w = events.findIndex((e) => e.waiting?.reason === 'backoff')
    expect(w).toBeGreaterThan(-1)
    expect(events[w + 1].waiting).toBeUndefined()
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

  it('abort depois da resposta recebida: a resposta paga é gravada, e nada novo é pedido', async () => {
    const ac = new AbortController()
    const lines = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} goes here.`)
    const d = deps((req) => {
      ac.abort()
      return echo(req)
    })
    const err = await translateDocument(input(srt(...lines)), d, { signal: ac.signal }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(TranslationCancelled)
    expect(d.calls).toHaveLength(1)
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

  it('progresso: chunks concluídos/em voo e mapa da linha do tempo', async () => {
    const lines = Array.from({ length: 45 }, (_, i) => `Sentence number ${i} goes here.`)
    const events: TranslateProgress[] = []
    await translateDocument(input(srt(...lines)), deps(echo), { onProgress: (p) => events.push(p) })
    expect(events[0]).toMatchObject({ phase: 'lookup', done: 0, total: 45, cached: 0 })
    expect(events).toContainEqual(
      expect.objectContaining({
        phase: 'translating',
        done: 0,
        chunk: { completed: 0, count: 2, inFlight: 1 },
        timeline: expect.objectContaining({ active: [[0, 40]], lanes: [[0, 45]] })
      })
    )
    expect(events).toContainEqual(
      expect.objectContaining({ done: 40, chunk: { completed: 1, count: 2, inFlight: 0 } })
    )
    expect(events.at(-1)).toMatchObject({
      done: 45,
      chunk: { completed: 2, count: 2, inFlight: 0 },
      timeline: { total: 45, cached: [], translated: [[0, 45]], failed: [], active: [] }
    })
  })

  it('glossário e estilo do preset vão no System Prompt; max_tokens proporcional e limitado pelo modelo', async () => {
    const d = deps(echo)
    await translateDocument(
      input(srt('Hello senpai, how are you?'), {
        preset: {
          model: 'a/b',
          glossary: [{ source: 'senpai', rule: 'keep it' }],
          temperature: 0.7,
          prompt: 'Media type: anime.'
        }
      }),
      d
    )
    expect(d.calls[0].messages[0].content).toContain('1. "senpai": keep it')
    expect(d.calls[0].messages[0].content).toContain('<style>\nMedia type: anime.\n</style>')
    expect(d.calls[0].temperature).toBe(0.7)
    expect(d.calls[0].maxTokens).toBeGreaterThanOrEqual(256)
    expect(d.calls[0].maxTokens).toBeLessThanOrEqual(8000)
  })
})

/** SRT longo com timecodes reais: falas de 1,5 s a cada 2 s; `gapAfter` abre 30 s de silêncio. */
function longSrt(
  n: number,
  gapAfter: readonly number[] = [],
  text = (i: number): string => `Sentence number ${i} goes here.`
): SubtitleDocument<unknown> {
  const tc = (ms: number): string => {
    const h = Math.floor(ms / 3_600_000)
    const m = Math.floor(ms / 60_000) % 60
    const s = Math.floor(ms / 1000) % 60
    const p = (x: number, w = 2): string => String(x).padStart(w, '0')
    return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`
  }
  let t = 0
  const blocks: string[] = []
  for (let i = 0; i < n; i++) {
    blocks.push(`${i + 1}\n${tc(t)} --> ${tc(t + 1500)}\n${text(i)}\n`)
    t += 2000 + (gapAfter.includes(i) ? 30_000 : 0)
  }
  return srtFormat.parse(blocks.join('\n'))
}

const firstId = (req: ChatRequest): number => [...targetLines(req).keys()][0]

describe('translateDocument em lanes', () => {
  it('perJob 4 com 10 chunks: 4 requisições em voo ao mesmo tempo, mesmo session_id', async () => {
    let inFlight = 0
    let peak = 0
    const d = deps(
      async (req) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 1))
        inFlight--
        return echo(req)
      },
      { lanes: async () => 4, sessionId: () => 'sess-1' }
    )
    const r = await translateDocument(input(longSrt(400)), d)
    expect(r.failed).toEqual([])
    expect(peak).toBe(4)
    expect(new Set(d.calls.map((c) => c.sessionId))).toEqual(new Set(['sess-1']))
  })

  it('só a cabeça de cada lane sai sem <translation> no contexto', async () => {
    const d = deps(echo, { lanes: async () => 4 })
    await translateDocument(input(longSrt(400)), d)
    const withoutTranslation = d.calls.filter(
      (c) => !c.messages.find((m) => m.role === 'user')!.content.includes('<translation>')
    )
    expect(withoutTranslation).toHaveLength(4)
  })

  it('corta nos silêncios: a lane começa logo depois do gap', async () => {
    const d = deps(echo, { lanes: async () => 2 })
    // 150 linhas = 4 chunks -> 2 lanes. Cortes que não criam chunk extra: 70..80. Ideal 75;
    // silêncio depois do índice 77 -> a lane 2 começa no id 79.
    await translateDocument(input(longSrt(150, [77])), d)
    const heads = d.calls
      .filter((c) => !c.messages.find((m) => m.role === 'user')!.content.includes('<translation>'))
      .map(firstId)
    expect(heads.sort((x, y) => x - y)).toEqual([1, 79])
  })

  it('não encarece: paralelo manda no máximo o mesmo volume de prompt do sequencial', async () => {
    const size = (calls: ChatRequest[]): number =>
      calls.reduce((n, c) => n + c.messages.reduce((m, x) => m + x.content.length, 0), 0)
    const seq = deps(echo)
    await translateDocument(input(longSrt(400)), seq)
    await t.close()
    t = await openTestDatabase()
    memory = new JobMemoryService(new JobMemoryRepository(t.db))
    const par = deps(echo, { lanes: async () => 4 })
    await translateDocument(input(longSrt(400)), { ...par, memory })
    expect(par.calls.length).toBe(seq.calls.length)
    expect(size(par.calls)).toBeLessThanOrEqual(size(seq.calls))
  })

  it('erro fatal numa lane drena: a resposta em voo da outra é gravada e nada novo sai', async () => {
    let releaseLane2!: () => void
    const lane2 = new Promise<void>((r) => (releaseLane2 = r))
    const d = deps(
      async (req) => {
        if (firstId(req) === 1) {
          // Espera a lane 2 estar em voo antes de falhar.
          await new Promise((r) => setTimeout(r, 5))
          setTimeout(releaseLane2, 5)
          throw new LlmError('auth', 'bad key', { status: 401 })
        }
        await lane2
        return echo(req)
      },
      { lanes: async () => 2 }
    )
    const err = await translateDocument(input(longSrt(160)), d).catch((e) => e)
    expect(err).toMatchObject({ code: 'LLM_AUTH' })
    expect(d.calls).toHaveLength(2)

    // A resposta da lane 2 foi paga e validada: está no Job Memory.
    const again = deps(echo)
    await translateDocument(input(longSrt(160)), again)
    const sent = again.calls.reduce((n, c) => n + targetLines(c).size, 0)
    expect(sent).toBe(160 - 40)
  })

  it('cancelamento aborta todas as lanes na hora', async () => {
    const ac = new AbortController()
    const signals: AbortSignal[] = []
    const d = deps(() => ok('{}'), {
      lanes: async () => 2,
      llm: {
        chat: (_req, signal) => {
          signals.push(signal!)
          if (signals.length === 2) setTimeout(() => ac.abort(), 1)
          return new Promise((_, reject) =>
            signal!.addEventListener('abort', () => reject(new LlmError('aborted', 'aborted')))
          )
        },
        generationCost: async () => null
      }
    })
    const err = await translateDocument(input(longSrt(160)), d, { signal: ac.signal }).catch(
      (e) => e
    )
    expect(err).toBeInstanceOf(TranslationCancelled)
    expect(signals).toHaveLength(2)
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  it('timeline: uma faixa por lane e o cache aparece como já resolvido', async () => {
    await translateDocument(input(longSrt(160)), deps(echo))
    // Muda as 80 primeiras: as 80 últimas viram cache.
    const changed = longSrt(160, [], (i) =>
      i < 80 ? `Changed sentence ${i} here.` : `Sentence number ${i} goes here.`
    )
    const events: TranslateProgress[] = []
    await translateDocument(input(changed), deps(echo, { lanes: async () => 4 }), {
      onProgress: (p) => events.push(p)
    })
    const last = events.at(-1)!
    expect(last.timeline!.cached).toEqual([[80, 160]])
    expect(last.timeline!.translated).toEqual([[0, 80]])
    expect(last.timeline!.lanes).toHaveLength(1)
  })
})
