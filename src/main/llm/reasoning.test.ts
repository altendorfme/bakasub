import { describe, expect, it } from 'vitest'
import { parseModel, type ModelInfo } from './model-catalog'
import { planReasoning, reasoningStarved } from './reasoning'
import { estimateTokens } from './token-estimate'

/** Objetos `reasoning` reais de `GET /api/v1/models` (conferidos em 2026-11-22). */
const CATALOG = {
  'nvidia/nemotron-3-super-120b-a12b': {
    mandatory: false,
    default_enabled: true,
    supports_max_tokens: true,
    supported_efforts: ['medium', 'low', 'none'],
    default_effort: 'medium'
  },
  'xiaomi/mimo-v2.6-flash': { mandatory: false },
  'anthropic/claude-haiku-5.5': {
    mandatory: false,
    supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low', 'none'],
    default_effort: 'medium'
  },
  'google/gemini-3.1-flash-lite': {
    mandatory: false,
    default_enabled: true,
    supported_efforts: ['high', 'medium', 'low', 'minimal', 'none'],
    default_effort: 'minimal'
  },
  'google/gemini-2.5-flash-lite': { mandatory: false },
  /** Formas reais de modelos com raciocínio obrigatório. */
  'x/mandatory-efforts': {
    mandatory: true,
    supported_efforts: ['high', 'medium', 'low'],
    default_effort: 'medium'
  },
  'x/mandatory-bare': { mandatory: true },
  'x/default-off': { mandatory: false, default_enabled: false }
} as const

const model = (id: keyof typeof CATALOG, params = ['reasoning', 'include_reasoning']): ModelInfo =>
  parseModel({ id, supported_parameters: params, reasoning: CATALOG[id] })!

describe('parseModel: reasoning', () => {
  it('normaliza o objeto do catálogo', () => {
    expect(model('nvidia/nemotron-3-super-120b-a12b').reasoning).toEqual({
      mandatory: false,
      supportedEfforts: ['medium', 'low', 'none'],
      defaultEnabled: true,
      supportsMaxTokens: true
    })
    expect(model('xiaomi/mimo-v2.6-flash').reasoning).toEqual({
      mandatory: false,
      supportsMaxTokens: false
    })
  })
  it('sem objeto, sem `reasoning` em supported_parameters ou objeto inválido => ausente', () => {
    expect(
      parseModel({ id: 'a/b', supported_parameters: ['reasoning'] })!.reasoning
    ).toBeUndefined()
    expect(model('xiaomi/mimo-v2.6-flash', ['temperature']).reasoning).toBeUndefined()
    expect(
      parseModel({ id: 'a/b', supported_parameters: ['reasoning'], reasoning: 'yes' })
    ).toMatchObject({ id: 'a/b' })
  })
  it('esforço desconhecido é descartado', () => {
    const m = parseModel({
      id: 'a/b',
      supported_parameters: ['reasoning'],
      reasoning: { mandatory: true, supported_efforts: ['turbo', 'low'] }
    })!
    expect(m.reasoning?.supportedEfforts).toEqual(['low'])
  })
})

describe('planReasoning', () => {
  it('`none` aceito => effort none (Nemotron, Haiku 5.5, Gemini 3.1)', () => {
    for (const id of [
      'nvidia/nemotron-3-super-120b-a12b',
      'anthropic/claude-haiku-5.5',
      'google/gemini-3.1-flash-lite'
    ] as const)
      expect(planReasoning(model(id))).toEqual({ request: { effort: 'none' }, needsSlack: false })
  })
  it('desligável sem lista de esforços => enabled: false (MiMo, Gemini 2.5)', () => {
    for (const id of ['xiaomi/mimo-v2.6-flash', 'google/gemini-2.5-flash-lite'] as const)
      expect(planReasoning(model(id))).toEqual({ request: { enabled: false }, needsSlack: false })
  })
  it('mandatory => menor esforço aceito + folga; sem lista, só a folga', () => {
    expect(planReasoning(model('x/mandatory-efforts'))).toEqual({
      request: { effort: 'low' },
      needsSlack: true
    })
    expect(planReasoning(model('x/mandatory-bare'))).toEqual({ needsSlack: true })
  })
  it('sem controle no catálogo ou já desligado => nada', () => {
    expect(planReasoning(parseModel({ id: 'a/b' })!)).toEqual({ needsSlack: false })
    expect(planReasoning(model('x/default-off'))).toEqual({ needsSlack: false })
  })
})

describe('reasoningStarved', () => {
  const s = (
    content: string,
    completionTokens: number | null,
    reasoningTokens: number | null
  ): boolean => reasoningStarved({ content, completionTokens, reasoningTokens }, estimateTokens)
  it('usa reasoning_tokens quando vem', () => {
    expect(s('', 256, 256)).toBe(true)
    expect(s('{"1":"Olá', 256, 200)).toBe(true)
    expect(s('{"1":"x".repeat(300)', 1000, 10)).toBe(false)
  })
  it('sem reasoning_tokens: texto visível muito menor que a saída cobrada', () => {
    expect(s('', 256, null)).toBe(true)
    expect(s('x'.repeat(4000), 1000, null)).toBe(false)
  })
  it('sem usage: só conteúdo vazio', () => {
    expect(s('  ', null, null)).toBe(true)
    expect(s('{"1":"PT', null, null)).toBe(false)
  })
})
