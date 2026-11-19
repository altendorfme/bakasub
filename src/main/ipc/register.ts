import type { AppInfoService } from '../services/app-info.service'
import type { AppUpdateService } from '../services/app-update.service'
import type { JobMemoryService } from '../memory/job-memory.service'
import type { SecretVault } from '../settings/secret-vault'
import type { SidecarManager } from '../sidecars/sidecar-manager'
import { registerAppHandlers } from './handlers/app.handler'
import { registerMemoryHandlers } from './handlers/memory.handler'
import { registerSettingsHandlers } from './handlers/settings.handler'
import { registerSidecarHandlers } from './handlers/sidecar.handler'

export interface IpcDependencies {
  appInfo: AppInfoService
  appUpdate: AppUpdateService
  sidecars: SidecarManager
  memory: JobMemoryService
  vault: SecretVault
}

/** Composition root dos handlers IPC. Um arquivo por domínio em ./handlers. */
export function registerIpc(deps: IpcDependencies): void {
  registerAppHandlers(deps)
  registerSidecarHandlers(deps)
  registerMemoryHandlers(deps)
  registerSettingsHandlers(deps)
}
