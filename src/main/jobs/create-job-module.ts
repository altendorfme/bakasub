import type { Database } from '../database/init'
import { BatchRepository } from '../database/repositories/batch.repository'
import { JobRepository } from '../database/repositories/job.repository'
import { BatchService } from '../batch/batch-service'
import { ProfileRepository } from '../database/repositories/profile.repository'
import { SettingsRepository } from '../database/repositories/settings.repository'
import type { LlmLog } from '../llm/llm-session'
import { ModelCatalog } from '../llm/model-catalog'
import { OpenRouterClient } from '../llm/openrouter-client'
import { translateDocument } from '../llm/translate-document'
import { MkvToolnix, type CommandRunner, type ToolResolver } from '../media/mkvtoolnix-service'
import type { JobMemoryService } from '../memory/job-memory.service'
import { ProfileService } from '../profiles/profile.service'
import type { SecretVault } from '../settings/secret-vault'
import { SettingsService } from '../settings/settings.service'
import type { JobProgressEvent } from '../../shared/ipc-contract'
import { JobManager } from './job-manager'
import { JobRunner } from './job-runner'
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
  readonly log: {
    jobs: { info(m: string): void; warn(m: string): void; error(m: string, e?: unknown): void }
    llm: LlmLog
  }
}

/**
 * Composition root da camada de jobs (sem `electron`): LLM, catálogo, perfis, mkvtoolnix e
 * fila. O `main/index.ts` só passa infraestrutura (banco, cofre, sidecars, IPC).
 */
export function createJobModule(o: JobModuleOptions): {
  jobs: JobManager
  profiles: ProfileService
  mkv: MkvToolnix
  models: ModelCatalog
  settings: SettingsService
  batches: BatchService
} {
  const settings = new SettingsService(new SettingsRepository(o.db), (key, err) =>
    o.log.jobs.warn(`invalid setting ${key}: ${String(err)}`)
  )
  const client = new OpenRouterClient({ apiKey: () => o.vault.get('openrouter.apiKey') })
  const models = new ModelCatalog(client, settings)
  const mkv = new MkvToolnix(o.runner, o.tools)

  const translator: SubtitleTranslator = {
    translate: (input, opts) =>
      translateDocument(
        {
          doc: input.doc,
          format: input.format,
          profile: {
            model: input.profile.model,
            glossary: input.profile.glossary,
            temperature: input.profile.temperature
          },
          targetLang: input.targetLang,
          sourceLang: input.sourceLang
        },
        { llm: client, memory: o.memory, models, log: o.log.llm },
        opts
      )
  }

  // `profiles` precisa de `jobs` (perfil em uso) e vice-versa (cópia do perfil): referência tardia.
  let jobsRef: JobManager | null = null
  const profiles = new ProfileService(new ProfileRepository(o.db), {
    isInUse: (id) => jobsRef?.isProfileInUse(id) ?? false
  })
  const jobs = new JobManager({
    repo: new JobRepository(o.db),
    runner: new JobRunner({ mkv, translator }),
    profiles,
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
    profiles,
    preferredSourceLangs: () => settings.get('tracks.preferredSourceLangs')
  })
  return { jobs, profiles, mkv, models, settings, batches }
}
