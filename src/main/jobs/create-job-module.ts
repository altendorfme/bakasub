import type { Database } from '../database/init'
import { BatchRepository } from '../database/repositories/batch.repository'
import { JobRepository } from '../database/repositories/job.repository'
import { BatchService } from '../batch/batch-service'
import { PresetRepository } from '../database/repositories/preset.repository'
import { SettingsRepository } from '../database/repositories/settings.repository'
import type { LlmLog } from '../llm/llm-session'
import { ModelCatalog } from '../llm/model-catalog'
import { FreeQuota } from '../llm/free-quota'
import { realSleep } from '../llm/llm-session'
import { OpenRouterClient, type KeyInfo } from '../llm/openrouter-client'
import { validateOpenRouterKey } from '../llm/validate-key'
import { RateLimiter } from '../llm/rate-limiter'
import { translateDocument, type RetrySettings } from '../llm/translate-document'
import { MkvToolnix, type CommandRunner, type ToolResolver } from '../media/mkvtoolnix-service'
import type { JobMemoryService } from '../memory/job-memory.service'
import { PresetService } from '../presets/preset.service'
import type { SecretVault } from '../settings/secret-vault'
import type { MediaContextService } from '../media-context/media-context.service'
import { PreferencesService } from '../settings/preferences.service'
import { SettingsService } from '../settings/settings.service'
import type { JobProgressEvent } from '../../shared/ipc-contract'
import { JobManager } from './job-manager'
import { JobRunner } from './job-runner'
import type { MediaLookupSource } from './job-spec'
import { Preflighter } from '../preflight/preflighter'
import type { SubtitleTranslator } from './step-context'

export interface JobModuleOptions {
  readonly db: Database
  readonly memory: JobMemoryService
  readonly vault: SecretVault
  readonly runner: CommandRunner
  readonly tools: ToolResolver
  /** `userData/cache/jobs`. */
  readonly workRoot: string
  readonly emit: (event: JobProgressEvent) => void
  /** Chaves públicas alteradas pelo usuário (além do que o módulo já trata). */
  readonly onSettingsChanged?: (keys: readonly string[]) => void
  /** Busca de detalhes do TMDB para o contexto de mídia dos jobs. */
  readonly mediaContext?: Pick<MediaContextService, 'lookup'>
  readonly log: {
    jobs: {
      info(m: string): void
      warn(m: string, e?: unknown): void
      error(m: string, e?: unknown): void
    }
    llm: LlmLog
  }
}

/**
 * Composition root da camada de jobs (sem `electron`): LLM, catálogo, perfis, mkvtoolnix e
 * fila. O `main/index.ts` só passa infraestrutura (banco, cofre, sidecars, IPC).
 */
export function createJobModule(o: JobModuleOptions): {
  jobs: JobManager
  presets: PresetService
  mkv: MkvToolnix
  models: ModelCatalog
  settings: SettingsService
  preferences: PreferencesService
  batches: BatchService
  freeQuota: FreeQuota
  validateApiKey: (key: string) => Promise<KeyInfo>
} {
  const settings = new SettingsService(new SettingsRepository(o.db), (key, err) =>
    o.log.jobs.warn(`invalid setting ${key}: ${String(err)}`)
  )
  const client = new OpenRouterClient({ apiKey: () => o.vault.get('openrouter.apiKey') })
  const models = new ModelCatalog(client, settings)
  const mkv = new MkvToolnix(o.runner, o.tools)
  // Um limitador para o processo inteiro: os limites do OpenRouter são por conta, não por job.
  const limiter = new RateLimiter({
    config: async () => ({
      freeRpm: await settings.get('llm.rateLimit.freeRpm'),
      paidRpm: await settings.get('llm.rateLimit.paidRpm'),
      freeMaxInFlight: await settings.get('llm.concurrency.freeMaxInFlight'),
      paidMaxInFlight: await settings.get('llm.concurrency.paidMaxInFlight')
    }),
    sleep: realSleep
  })
  const retrySettings = async (): Promise<RetrySettings> => ({
    maxThrottled: await settings.get('llm.retry.maxThrottled'),
    maxTransient: await settings.get('llm.retry.maxTransient'),
    baseDelayMs: await settings.get('llm.retry.baseDelayMs'),
    maxDelayMs: await settings.get('llm.retry.maxDelayMs'),
    chunkRounds: await settings.get('llm.retry.chunkRounds')
  })
  const freeQuota = new FreeQuota({
    keyInfo: (signal) => client.keyInfo(signal),
    tierSetting: () => settings.get('llm.rateLimit.freeTier')
  })
  const lanes = (): Promise<number> => settings.get('llm.concurrency.perJob')
  const preflighter = new Preflighter({ models, memory: o.memory, freeQuota, lanes })

  const translator: SubtitleTranslator = {
    translate: (input, opts) =>
      translateDocument(
        {
          doc: input.doc,
          format: input.format,
          preset: {
            model: input.preset.model,
            glossary: input.preset.glossary,
            temperature: input.preset.temperature,
            prompt: input.preset.prompt
          },
          media: input.media,
          mediaScope: input.mediaScope,
          memory: input.memory,
          targetLang: input.targetLang,
          sourceLang: input.sourceLang
        },
        { llm: client, memory: o.memory, models, log: o.log.llm, limiter, retrySettings, lanes },
        opts
      )
  }

  // `presets` precisa de `jobs` (preset em uso) e vice-versa (cópia do preset): referência tardia.
  let jobsRef: JobManager | null = null
  const presets = new PresetService(new PresetRepository(o.db), {
    isInUse: (id) => jobsRef?.isPresetInUse(id) ?? false
  })
  const presetSource = {
    get: (id: string) => presets.get(id),
    defaults: async () => ({
      presetId: await settings.get('translation.defaultPresetId'),
      model: await settings.get('translation.defaultModel'),
      targetLang: await settings.get('translation.defaultTargetLang')
    })
  }
  const media: MediaLookupSource | undefined = o.mediaContext
    ? {
        lookup: (ref, ep) => o.mediaContext!.lookup(ref, ep),
        onError: (err) =>
          o.log.jobs.warn('media context lookup failed; the job continues without it', err)
      }
    : undefined
  const jobs = new JobManager({
    repo: new JobRepository(o.db),
    runner: new JobRunner({
      mkv,
      translator,
      preflight: {
        run: (input, signal) => preflighter.run(input, signal),
        autoConfirmBelowUsd: () => settings.get('preflight.autoConfirmBelowUsd')
      },
      log: o.log.jobs
    }),
    presets: presetSource,
    ...(media ? { media } : {}),
    workRoot: o.workRoot,
    concurrency: () => settings.get('jobs.concurrency'),
    emit: o.emit,
    log: o.log.jobs
  })
  jobsRef = jobs
  const batches = new BatchService({
    batches: new BatchRepository(o.db),
    jobs,
    mkv,
    presets: presetSource,
    ...(media ? { media } : {}),
    preferredSourceLangs: () => settings.get('tracks.preferredSourceLangs')
  })
  const preferences = new PreferencesService({
    settings,
    presetExists: (id) =>
      presets.get(id).then(
        () => true,
        () => false
      ),
    // Mais slots => a fila anda na hora; menos slots valem conforme os jobs terminam.
    onChanged: (keys) => {
      if (keys.includes('jobs.concurrency')) jobs.kick()
      if (keys.includes('llm.rateLimit.freeTier')) freeQuota.invalidate()
      o.onSettingsChanged?.(keys)
    }
  })
  const validateApiKey = (key: string): Promise<KeyInfo> =>
    validateOpenRouterKey((signal, k) => client.keyInfo(signal, k), key)
  return { jobs, presets, mkv, models, settings, preferences, batches, freeQuota, validateApiKey }
}
