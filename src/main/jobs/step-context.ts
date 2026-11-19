import type { JobProgress, JobResult } from '../../shared/ipc-contract'
import type { TranslateProgress, TranslateResult } from '../llm/translate-document'
import type { MkvToolnix } from '../media/mkvtoolnix-service'
import type { InlineLexer, SubtitleDocument } from '../parsers'
import type { PreflightInput, PreflightOutput } from '../preflight/preflighter'
import type { Artifacts } from './artifacts'
import type { JobSpec, PresetSnapshot } from './job-spec'

/** Tradução de um documento, já com LLM/Job Memory/catálogo ligados (ver `translateDocument`). */
export interface SubtitleTranslator {
  translate<F>(
    input: {
      doc: SubtitleDocument<F>
      format: { lexInline: InlineLexer }
      preset: PresetSnapshot
      /** Notas do usuário / contexto de mídia (`<media>`). */
      media?: string
      targetLang: string
      sourceLang?: string
    },
    opts: { signal: AbortSignal; onProgress: (p: TranslateProgress) => void }
  ): Promise<TranslateResult<F>>
}

export interface PreflightDeps {
  run(input: PreflightInput, signal?: AbortSignal): Promise<PreflightOutput>
  /** Setting `preflight.autoConfirmBelowUsd`. */
  autoConfirmBelowUsd(): Promise<number | null>
}

export interface StepDeps {
  readonly mkv: Pick<MkvToolnix, 'probe' | 'extract' | 'mux'>
  readonly translator: SubtitleTranslator
  readonly preflight: PreflightDeps
}

export interface StepContext {
  readonly spec: JobSpec
  /** `userData/cache/jobs/<id>/`. */
  readonly workDir: string
  /** Mutável: cada etapa grava aqui o seu artefato; o runner persiste após cada etapa. */
  readonly artifacts: Artifacts
  readonly signal: AbortSignal
  readonly deps: StepDeps
  progress(p: Omit<JobProgress, 'step'>): void
  warn(message: string): void
  /** Uso do LLM mesmo quando a etapa termina por cancelamento. */
  recordUsage(usage: NonNullable<JobResult['usage']>): void
}

export type Step = (ctx: StepContext) => Promise<void>
