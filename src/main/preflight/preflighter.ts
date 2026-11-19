import type { PreflightEstimate } from '../../shared/ipc-contract'
import { AppError } from '../errors'
import type { CatalogSnapshot, ModelInfo } from '../llm/model-catalog'
import { parseGlossary } from '../llm/prompt-builder'
import { JobMemoryService } from '../memory/job-memory.service'
import {
  analyzeCoverage,
  type CoverageReport,
  type InlineLexer,
  type SubtitleDocument
} from '../parsers'
import { estimatePreflight } from './estimate'

export interface PreflightInput {
  readonly doc: SubtitleDocument<unknown>
  readonly format: { readonly lexInline: InlineLexer }
  readonly preset: {
    readonly model: string
    readonly glossary: readonly unknown[]
    readonly temperature: number
    readonly prompt: string
  }
  readonly targetLang: string
  readonly sourceLang?: string
  readonly media?: string
}

export interface PreflightOutput {
  readonly estimate: Omit<PreflightEstimate, 'decision'>
  readonly coverage: CoverageReport
}

/** Liga catálogo (preço e capacidades), Job Memory em `peek` e o estimador. Sem rede de LLM. */
export class Preflighter {
  constructor(
    private readonly deps: {
      models: {
        find(id: string, signal?: AbortSignal): Promise<ModelInfo | null>
        get(options?: { signal?: AbortSignal }): Promise<CatalogSnapshot>
      }
      memory: JobMemoryService
    }
  ) {}

  async run(input: PreflightInput, signal?: AbortSignal): Promise<PreflightOutput> {
    const model = await this.deps.models.find(input.preset.model, signal)
    if (!model)
      throw new AppError(
        'LLM_UNKNOWN_MODEL',
        `Model not found on OpenRouter: ${input.preset.model}`
      )
    const snapshot = await this.deps.models.get({ signal })
    const glossary = parseGlossary(input.preset.glossary).entries
    // Mesma chave do `translateDocument`, para a taxa de acerto bater com a execução real.
    const ctx = JobMemoryService.context({
      targetLang: input.targetLang,
      model: model.id,
      glossary,
      stylePrompt: input.preset.prompt,
      lexInline: input.format.lexInline,
      sourceLang: input.sourceLang
    })
    const lookup = await this.deps.memory.lookupDocument(input.doc, ctx, { peek: true })
    return {
      estimate: estimatePreflight({
        doc: input.doc,
        preset: { glossary, prompt: input.preset.prompt },
        targetLang: input.targetLang,
        sourceLang: input.sourceLang,
        media: input.media,
        model,
        lookup,
        catalogFetchedAt: snapshot.fetchedAt
      }),
      coverage: analyzeCoverage(input.doc)
    }
  }
}
