import type { ModelInfo } from './model-catalog'
import type { ResponseFormat } from './openrouter-client'
import { responseSchema } from './prompt-builder'

/**
 * Degraus do modo de saída, do mais estrito ao mais permissivo. Um 404 "No endpoints found"
 * (`unsupported-params`) desce um degrau; o Zod valida a resposta em qualquer um deles.
 *
 * - `json_schema_strict`: `json_schema` estrito + `provider.require_parameters` (só endpoints
 *   que suportam tudo).
 * - `json_schema`: o mesmo schema sem `require_parameters`; para o OpenRouter `response_format`
 *   vira preferência suave (endpoint sem suporte ignora).
 * - `json_object`: JSON livre.
 * - `prompt`: só a instrução no prompt.
 */
export const OUTPUT_MODES = ['json_schema_strict', 'json_schema', 'json_object', 'prompt'] as const
export type OutputMode = (typeof OUTPUT_MODES)[number]

/** Primeiro degrau que o catálogo diz que o modelo suporta. */
export function initialOutputMode(
  m: Pick<ModelInfo, 'structuredOutputs' | 'responseFormat'>
): OutputMode {
  if (m.structuredOutputs) return 'json_schema_strict'
  if (m.responseFormat) return 'json_object'
  return 'prompt'
}

export function requestFormat(
  mode: OutputMode,
  ids: readonly number[]
): { responseFormat?: ResponseFormat; requireParameters?: boolean } {
  switch (mode) {
    case 'json_schema_strict':
      return {
        responseFormat: { type: 'json_schema', name: 'translations', schema: responseSchema(ids) },
        requireParameters: true
      }
    case 'json_schema':
      return {
        responseFormat: { type: 'json_schema', name: 'translations', schema: responseSchema(ids) }
      }
    case 'json_object':
      return { responseFormat: { type: 'json_object' } }
    case 'prompt':
      return {}
  }
}

export interface OutputModeDowngrade {
  readonly from: OutputMode
  readonly to: OutputMode
}

/**
 * Modo de saída de um job, compartilhado por todas as lanes: depois de um rebaixamento nenhum
 * chunk (desta ou de outra lane) tenta o degrau anterior. Só desce.
 */
export class OutputModeState {
  private mode: OutputMode
  private readonly history: OutputModeDowngrade[] = []

  constructor(initial: OutputMode) {
    this.mode = initial
  }

  get current(): OutputMode {
    return this.mode
  }

  get downgrades(): readonly OutputModeDowngrade[] {
    return this.history
  }

  /**
   * A requisição feita em `failed` recebeu 404. Se outra lane já desceu de `failed`, só devolve o
   * modo atual (sem descer de novo). `null`: não há degrau abaixo.
   */
  downgrade(failed: OutputMode): { mode: OutputMode; changed: boolean } | null {
    if (OUTPUT_MODES.indexOf(this.mode) > OUTPUT_MODES.indexOf(failed))
      return { mode: this.mode, changed: false }
    const next = OUTPUT_MODES[OUTPUT_MODES.indexOf(this.mode) + 1]
    if (!next) return null
    this.history.push({ from: this.mode, to: next })
    this.mode = next
    return { mode: next, changed: true }
  }
}
