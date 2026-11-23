import { describe, expect, it, vi } from 'vitest'
import {
  LlmError,
  OpenRouterClient,
  parseRateLimitHeaders,
  parseRetryAfter,
  redact
} from './openrouter-client'

const KEY = 'sk-or-v1-SECRETSECRET'
const sse = (...events: unknown[]): string =>
  events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('')
const chunk = (content: string, finish: string | null = null): unknown => ({
  object: 'chat.completion.chunk',
  choices: [{ delta: { content }, finish_reason: finish }]
})
const usage = {
  object: 'chat.completion.chunk',
  choices: [{ delta: { content: '' }, finish_reason: 'stop' }],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    cost: 0.0012,
    prompt_tokens_details: { cached_tokens: 4 }
  }
}

function streamResponse(parts: string[], init: ResponseInit = {}, delayMs = 0): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(c) {
      for (const p of parts) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
        c.enqueue(enc.encode(p))
      }
      c.close()
    }
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'x-generation-id': 'gen-1' },
    ...init
  })
}

const client = (
  fetchImpl: typeof fetch,
  over: Partial<ConstructorParameters<typeof OpenRouterClient>[0]> = {}
): OpenRouterClient =>
  new OpenRouterClient({ fetch: fetchImpl, apiKey: async () => KEY, idleTimeoutMs: 200, ...over })

const req = {
  model: 'a/b',
  messages: [{ role: 'user' as const, content: 'oi' }],
  temperature: 0.3,
  maxTokens: 100
}

describe('OpenRouterClient.chat', () => {
  it('acumula o conteúdo, lê usage e generation id; ignora keep-alive', async () => {
    const f = vi.fn(async () =>
      streamResponse([
        ': OPENROUTER PROCESSING\n\n',
        sse(chunk('{"1":'), chunk('"olá"}')),
        sse(usage, '[DONE]')
      ])
    )
    const r = await client(f as unknown as typeof fetch).chat(req)
    expect(r).toEqual({
      content: '{"1":"olá"}',
      finishReason: 'stop',
      generationId: 'gen-1',
      usage: { promptTokens: 10, completionTokens: 5, cachedTokens: 4, cost: 0.0012 }
    })
  })

  it('monta a requisição: stream, headers, response_format e require_parameters', async () => {
    const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      streamResponse([sse(chunk('x', 'stop'), '[DONE]')])
    )
    const schema = { type: 'object' }
    await client(f as unknown as typeof fetch).chat({
      ...req,
      responseFormat: { type: 'json_schema', name: 'translations', schema },
      requireParameters: true
    })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(headers['X-OpenRouter-Title']).toBe('BakaSub')
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'a/b',
      messages: req.messages,
      temperature: 0.3,
      max_tokens: 100,
      stream: true,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'translations', strict: true, schema }
      },
      provider: { require_parameters: true }
    })
  })

  it('reasoning vai no corpo quando pedido; reasoning_tokens lido do usage', async () => {
    const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      streamResponse([
        sse(
          chunk('', 'length'),
          {
            choices: [{ delta: { content: '' }, finish_reason: 'length' }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 256,
              cost: 0,
              completion_tokens_details: { reasoning_tokens: 250 }
            }
          },
          '[DONE]'
        )
      ])
    )
    const r = await client(f as unknown as typeof fetch).chat({
      ...req,
      reasoning: { effort: 'none' }
    })
    expect(JSON.parse(f.mock.calls[0][1].body as string).reasoning).toEqual({ effort: 'none' })
    expect(r.usage).toMatchObject({ completionTokens: 256, reasoningTokens: 250 })
    expect(r.finishReason).toBe('length')
  })

  it('sem reasoning pedido: corpo sem a chave', async () => {
    const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      streamResponse([sse(chunk('x', 'stop'), '[DONE]')])
    )
    await client(f as unknown as typeof fetch).chat(req)
    expect(JSON.parse(f.mock.calls[0][1].body as string)).not.toHaveProperty('reasoning')
  })

  it('json_schema sem require_parameters: corpo sem `provider` (preferência suave)', async () => {
    const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      streamResponse([sse(chunk('x', 'stop'), '[DONE]')])
    )
    const schema = { type: 'object' }
    await client(f as unknown as typeof fetch).chat({
      ...req,
      responseFormat: { type: 'json_schema', name: 'translations', schema }
    })
    expect(JSON.parse(f.mock.calls[0][1].body as string)).toEqual({
      model: 'a/b',
      messages: req.messages,
      temperature: 0.3,
      max_tokens: 100,
      stream: true,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'translations', strict: true, schema }
      }
    })
  })

  it('sem API key: erro auth sem chamar a rede', async () => {
    const f = vi.fn()
    await expect(
      client(f as unknown as typeof fetch, { apiKey: async () => null }).chat(req)
    ).rejects.toMatchObject({ kind: 'auth' })
    expect(f).not.toHaveBeenCalled()
  })

  it.each([
    [400, 'bad-request'],
    [401, 'auth'],
    [402, 'credits'],
    [403, 'moderation'],
    [408, 'timeout'],
    [429, 'rate-limit'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [500, 'server']
  ])('HTTP %i => %s', async (status, kind) => {
    const f = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: { code: status, message: `m ${KEY}` } }), {
        status,
        headers: { 'retry-after': '2' }
      })
    const err = (await client(f as unknown as typeof fetch)
      .chat(req)
      .catch((e) => e)) as LlmError
    expect(err).toBeInstanceOf(LlmError)
    expect(err.kind).toBe(kind)
    expect(err.status).toBe(status)
    expect(err.message).not.toContain('SECRET')
    if (status === 429 || status === 503) expect(err.retryAfterMs).toBe(2000)
  })

  it.each([
    ['No endpoints found that can handle the requested parameters.', 'unsupported-params'],
    ['No endpoints found matching your data policy', 'unsupported-params'],
    ['Model not found', 'server']
  ])('HTTP 404 "%s" => %s', async (message, kind) => {
    const f = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: { code: 404, message } }), { status: 404 })
    const err = (await client(f as unknown as typeof fetch)
      .chat(req)
      .catch((e) => e)) as LlmError
    expect(err.kind).toBe(kind)
  })

  it('429 lê X-RateLimit-* (limite, restante, reset em epoch ms)', async () => {
    const f = async (): Promise<Response> =>
      new Response('{"error":{"code":429,"message":"Rate limit exceeded"}}', {
        status: 429,
        headers: {
          'x-ratelimit-limit': '20',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Date.now() + 30_000)
        }
      })
    const err = (await client(f as unknown as typeof fetch)
      .chat(req)
      .catch((e) => e)) as LlmError
    expect(err.kind).toBe('rate-limit')
    expect(err.details.rateLimit).toMatchObject({ limit: 20, remaining: 0 })
  })

  it('429 da cota diária de modelos free => daily-limit (não repete)', async () => {
    const reset = Date.now() + 6 * 3_600_000
    const f = async (): Promise<Response> =>
      new Response('{"error":{"code":429,"message":"free-models-per-day"}}', {
        status: 429,
        headers: {
          'x-ratelimit-limit': '50',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset)
        }
      })
    await expect(client(f as unknown as typeof fetch).chat(req)).rejects.toMatchObject({
      kind: 'daily-limit',
      details: { rateLimit: { limit: 50, remaining: 0, resetAtMs: reset } }
    })
  })

  it('429 dentro do stream => rate-limit', async () => {
    const f = async (): Promise<Response> =>
      streamResponse([
        sse({
          object: 'chat.completion.chunk',
          error: { code: 429, message: 'Rate limit exceeded' },
          choices: [{ delta: { content: '' }, finish_reason: 'error' }]
        })
      ])
    await expect(client(f as unknown as typeof fetch).chat(req)).rejects.toMatchObject({
      kind: 'rate-limit'
    })
  })

  it.each([
    [402, { reason: 'in_flight_budget_exhausted' }, 'budget-busy'],
    [402, { metadata: { reason: 'in_flight_budget_exhausted' } }, 'budget-busy'],
    [402, { metadata: { reason: 'weight_exceeds_budget' } }, 'credits'],
    [403, { metadata: { limit_source: 'openrouter_in_flight_budget' } }, 'budget-busy'],
    [402, {}, 'credits']
  ])(
    'HTTP %i %j => %s (orçamento em voo cheio passa sozinho; falta de saldo é fatal)',
    async (status, extra, kind) => {
      const f = async (): Promise<Response> =>
        new Response(JSON.stringify({ error: { code: status, message: 'x', ...extra } }), {
          status,
          headers: { 'retry-after': '2' }
        })
      await expect(client(f as unknown as typeof fetch).chat(req)).rejects.toMatchObject({
        kind,
        retryAfterMs: 2000
      })
    }
  )

  it('session_id vai no corpo quando informado', async () => {
    const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      streamResponse([sse(chunk('x', 'stop'), '[DONE]')])
    )
    await client(f as unknown as typeof fetch).chat({ ...req, sessionId: 'job-1' })
    expect(JSON.parse(f.mock.calls[0][1].body as string)).toMatchObject({ session_id: 'job-1' })
  })

  it('403 com budget (não moderação) => credits', async () => {
    const f = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          error: { code: 403, message: 'x', metadata: { limit_source: 'openrouter_key_limit' } }
        }),
        { status: 403 }
      )
    await expect(client(f as unknown as typeof fetch).chat(req)).rejects.toMatchObject({
      kind: 'credits'
    })
  })

  it('erro no meio do stream (HTTP 200)', async () => {
    const f = async (): Promise<Response> =>
      streamResponse([
        sse(chunk('{"1":"a'), {
          object: 'chat.completion.chunk',
          error: { code: 502, message: 'provider died' },
          choices: [{ delta: { content: '' }, finish_reason: 'error' }]
        })
      ])
    await expect(client(f as unknown as typeof fetch).chat(req)).rejects.toMatchObject({
      kind: 'stream-error',
      generationId: 'gen-1'
    })
  })

  it('finish_reason content_filter => moderation', async () => {
    const f = async (): Promise<Response> =>
      streamResponse([sse(chunk('', 'content_filter'), '[DONE]')])
    await expect(client(f as unknown as typeof fetch).chat(req)).rejects.toMatchObject({
      kind: 'moderation'
    })
  })

  it('finish_reason length é devolvido (quem chama decide dividir)', async () => {
    const f = async (): Promise<Response> =>
      streamResponse([sse(chunk('{"1":"a', 'length'), '[DONE]')])
    expect((await client(f as unknown as typeof fetch).chat(req)).finishReason).toBe('length')
  })

  it('stream que termina sem [DONE] nem finish_reason => stream-error', async () => {
    const f = async (): Promise<Response> => streamResponse([sse(chunk('{"1":'))])
    await expect(client(f as unknown as typeof fetch).chat(req)).rejects.toMatchObject({
      kind: 'stream-error'
    })
  })

  it('inatividade: aborta e lança timeout', async () => {
    const f = async (_u: string, init: RequestInit): Promise<Response> => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(sse(chunk('a'))))
          init.signal!.addEventListener('abort', () => c.error(init.signal!.reason))
        }
      })
      return new Response(body, { status: 200, headers: { 'x-generation-id': 'gen-9' } })
    }
    await expect(
      client(f as unknown as typeof fetch, { idleTimeoutMs: 50 }).chat(req)
    ).rejects.toMatchObject({ kind: 'timeout', generationId: 'gen-9' })
  })

  it('keep-alives contam como atividade', async () => {
    const f = async (): Promise<Response> =>
      streamResponse([': k\n\n', ': k\n\n', ': k\n\n', sse(chunk('ok', 'stop'), '[DONE]')], {}, 30)
    const r = await client(f as unknown as typeof fetch, { idleTimeoutMs: 50 }).chat(req)
    expect(r.content).toBe('ok')
  })

  it('abort do chamador => aborted, com generation id', async () => {
    const ac = new AbortController()
    const f = async (_u: string, init: RequestInit): Promise<Response> => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(sse(chunk('a'))))
          init.signal!.addEventListener('abort', () => c.error(init.signal!.reason))
          setTimeout(() => ac.abort(), 10)
        }
      })
      return new Response(body, { status: 200, headers: { 'x-generation-id': 'gen-7' } })
    }
    await expect(client(f as unknown as typeof fetch).chat(req, ac.signal)).rejects.toMatchObject({
      kind: 'aborted',
      generationId: 'gen-7'
    })
  })

  it('falha de rede => network', async () => {
    const f = async (): Promise<Response> => {
      throw new TypeError('fetch failed')
    }
    await expect(client(f as unknown as typeof fetch).chat(req)).rejects.toMatchObject({
      kind: 'network'
    })
  })
})

describe('OpenRouterClient.generationCost', () => {
  it('lê total_cost e tokens', async () => {
    const f = vi.fn(async () =>
      Response.json({
        data: { total_cost: 0.5, tokens_prompt: 3, tokens_completion: 4, cancelled: true }
      })
    )
    expect(await client(f as unknown as typeof fetch).generationCost('gen-1')).toEqual({
      cost: 0.5,
      promptTokens: 3,
      completionTokens: 4
    })
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://openrouter.ai/api/v1/generation?id=gen-1'
    )
  })
  it('qualquer falha => null (melhor esforço)', async () => {
    const f = async (): Promise<Response> => new Response('nope', { status: 404 })
    expect(await client(f as unknown as typeof fetch).generationCost('gen-1')).toBeNull()
  })
})

describe('OpenRouterClient.keyInfo', () => {
  it('lê is_free_tier e free_model_daily_requests de GET /key', async () => {
    const f = vi.fn(async () =>
      Response.json({
        data: {
          is_free_tier: false,
          usage: 3,
          free_model_daily_requests: { used: 12, limit: 1000, remaining: 988 }
        }
      })
    )
    expect(await client(f as unknown as typeof fetch).keyInfo()).toEqual({
      isFreeTier: false,
      freeDaily: { used: 12, limit: 1000, remaining: 988 }
    })
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('https://openrouter.ai/api/v1/key')
  })

  it('sem o objeto de cota => freeDaily null; 401 => auth', async () => {
    const a = async (): Promise<Response> => Response.json({ data: { is_free_tier: true } })
    expect(await client(a as unknown as typeof fetch).keyInfo()).toEqual({
      isFreeTier: true,
      freeDaily: null
    })
    const b = async (): Promise<Response> => new Response('{}', { status: 401 })
    await expect(client(b as unknown as typeof fetch).keyInfo()).rejects.toMatchObject({
      kind: 'auth'
    })
  })
})

describe('utilitários', () => {
  it('parseRetryAfter: segundos, data HTTP, inválido', () => {
    expect(parseRetryAfter('3', 0)).toBe(3000)
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000)
    expect(parseRetryAfter('abc', 0)).toBeUndefined()
    expect(parseRetryAfter(null, 0)).toBeUndefined()
  })
  it('parseRateLimitHeaders: ignora ausentes e inválidos', () => {
    const h = new Headers({ 'x-ratelimit-limit': '20', 'x-ratelimit-remaining': 'x' })
    expect(parseRateLimitHeaders(h)).toEqual({ limit: 20 })
    expect(parseRateLimitHeaders(new Headers())).toBeUndefined()
  })
  it('redact remove a key e padrões sk-or-*', () => {
    expect(redact(`x ${KEY} y sk-or-v1-abc123 z`, KEY)).toBe('x [REDACTED] y [REDACTED] z')
  })
})
