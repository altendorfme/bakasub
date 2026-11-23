import type { ModelInfo } from './model-catalog'

/** Do menor para o maior esforço (escala unificada do OpenRouter). */
export const REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

/** Controle de raciocínio de um modelo, normalizado do objeto `reasoning` de `/api/v1/models`. */
export interface ReasoningSupport {
  /** Não dá para desligar: nunca mandar `effort: "none"` nem `enabled: false`. */
  readonly mandatory: boolean
  /** Ausente = o modelo não aceita escolher o esforço. */
  readonly supportedEfforts?: readonly ReasoningEffort[]
  /** `false` = já vem desligado: nada a mandar. Ausente = desconhecido. */
  readonly defaultEnabled?: boolean
  /** Aceita `reasoning.max_tokens` (orçamento direto). */
  readonly supportsMaxTokens: boolean
}

/** Campo `reasoning` do corpo da requisição. `effort` ou `enabled`, nunca `exclude` (ainda cobra). */
export type ReasoningRequest = { readonly effort: ReasoningEffort } | { readonly enabled: false }

export interface ReasoningPlan {
  /** O que mandar; ausente = não mandar nada (corpo igual ao de antes). */
  readonly request?: ReasoningRequest
  /** O raciocínio continua ligado: o `max_tokens` precisa de folga para ele. */
  readonly needsSlack: boolean
}

/**
 * Escolhe como reduzir o raciocínio de um modelo: tradução de legenda não precisa dele, e os
 * tokens de raciocínio contam contra `max_tokens` junto com o texto.
 * 1. sem controle no catálogo -> nada;
 * 2. `mandatory` -> menor esforço aceito (ou nada, sem lista) + folga;
 * 3. `none` aceito -> `effort: "none"`;
 * 4. desligável sem `none` na lista (ou sem lista) -> `enabled: false`, salvo se já vem desligado.
 */
export function planReasoning(model: Pick<ModelInfo, 'reasoning'>): ReasoningPlan {
  const r = model.reasoning
  if (!r) return { needsSlack: false }
  const efforts = r.supportedEfforts ?? []
  if (r.mandatory) {
    const lowest = REASONING_EFFORTS.find((e) => e !== 'none' && efforts.includes(e))
    return lowest ? { request: { effort: lowest }, needsSlack: true } : { needsSlack: true }
  }
  if (efforts.includes('none')) return { request: { effort: 'none' }, needsSlack: false }
  if (r.defaultEnabled === false) return { needsSlack: false }
  return { request: { enabled: false }, needsSlack: false }
}

export function isReasoningEffort(v: string): v is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(v)
}

/** Acima desta fração da saída em raciocínio, `length` é falta de orçamento (não chunk grande). */
const REASONING_SHARE = 0.5
/** Sem `reasoning_tokens`: texto visível estimado abaixo disto da saída cobrada = tokens ocultos. */
const VISIBLE_SHARE = 0.25

/**
 * Uma resposta `finish_reason: length` gastou o orçamento em raciocínio? Critério principal:
 * `usage.completion_tokens_details.reasoning_tokens` perto de `completion_tokens`. Sem o campo,
 * compara o texto visível (estimado) com a saída cobrada; sem `usage`, só conteúdo vazio conta.
 */
export function reasoningStarved(
  res: {
    readonly content: string
    readonly completionTokens: number | null
    readonly reasoningTokens: number | null
  },
  estimate: (text: string) => number
): boolean {
  const out = res.completionTokens
  if (out !== null && out > 0) {
    if (res.reasoningTokens !== null) return res.reasoningTokens >= out * REASONING_SHARE
    return estimate(res.content) < out * VISIBLE_SHARE
  }
  return res.content.trim() === ''
}
