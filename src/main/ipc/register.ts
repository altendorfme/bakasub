import type { AppInfoService } from '../services/app-info.service'
import type { AppUpdateService } from '../services/app-update.service'
import type { BatchService } from '../batch/batch-service'
import type { JobManager } from '../jobs/job-manager'
import type { ModelCatalog } from '../llm/model-catalog'
import type { MkvToolnix } from '../media/mkvtoolnix-service'
import type { JobMemoryService } from '../memory/job-memory.service'
import type { ProfileService } from '../profiles/profile.service'
import type { SecretVault } from '../settings/secret-vault'
import type { SidecarManager } from '../sidecars/sidecar-manager'
import { registerAppHandlers } from './handlers/app.handler'
import { registerBatchHandlers } from './handlers/batches.handler'
import { registerJobHandlers } from './handlers/jobs.handler'
import { registerMediaHandlers } from './handlers/media.handler'
import { registerMemoryHandlers } from './handlers/memory.handler'
import { registerProfileHandlers } from './handlers/profiles.handler'
import { registerSettingsHandlers } from './handlers/settings.handler'
import { registerSidecarHandlers } from './handlers/sidecar.handler'

export interface IpcDependencies {
  appInfo: AppInfoService
  appUpdate: AppUpdateService
  sidecars: SidecarManager
  memory: JobMemoryService
  vault: SecretVault
  profiles: ProfileService
  jobs: JobManager
  mkv: MkvToolnix
  models: ModelCatalog
  batches: BatchService
}

/** Composition root dos handlers IPC. Um arquivo por domínio em ./handlers. */
export function registerIpc(deps: IpcDependencies): void {
  registerAppHandlers(deps)
  registerSidecarHandlers(deps)
  registerMemoryHandlers(deps)
  registerSettingsHandlers(deps)
  registerProfileHandlers(deps)
  registerJobHandlers(deps)
  registerMediaHandlers(deps)
  registerBatchHandlers(deps)
}
