import type { AppInfoService } from '../services/app-info.service'
import type { AppUpdateService } from '../services/app-update.service'
import type { SidecarManager } from '../sidecars/sidecar-manager'
import { registerAppHandlers } from './handlers/app.handler'
import { registerSidecarHandlers } from './handlers/sidecar.handler'

export interface IpcDependencies {
  appInfo: AppInfoService
  appUpdate: AppUpdateService
  sidecars: SidecarManager
}

/** Composition root dos handlers IPC. Um arquivo por domínio em ./handlers. */
export function registerIpc(deps: IpcDependencies): void {
  registerAppHandlers(deps)
  registerSidecarHandlers(deps)
}
