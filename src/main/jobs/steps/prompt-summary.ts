import type { PromptSummary } from '../../../shared/ipc-contract'
import { buildSystemPrompt, parseGlossary } from '../../llm/prompt-builder'
import { countTokens } from '../../preflight/token-counter'
import type { TranslationInput } from './translation-input'

/**
 * O System Prompt que o `translateDocument` vai enviar (mesmo `buildSystemPrompt`, mesmas
 * entradas) e quais blocos entraram. Determinístico: o preflight grava, o detalhe do Job mostra.
 */
export function summarizePrompt(input: TranslationInput): PromptSummary {
  const glossary = parseGlossary(input.preset.glossary).entries
  const system = buildSystemPrompt({
    targetLang: input.targetLang,
    sourceLang: input.sourceLang,
    glossary,
    stylePrompt: input.preset.prompt,
    media: input.media
  })
  return {
    system,
    systemTokens: countTokens(system),
    glossaryEntries: glossary.length,
    style: !!input.preset.prompt.trim(),
    media: input.mediaSources
  }
}

/** Aviso do job quando o contexto de mídia pedido não pôde ir ao LLM. */
export function mediaWarning(input: TranslationInput): string | null {
  const why = input.mediaSources.unavailable
  if (!why) return null
  return input.mediaSources.notes
    ? `media context: TMDB details were not sent, only the user notes (${why})`
    : `media context was not sent to the model (${why})`
}
