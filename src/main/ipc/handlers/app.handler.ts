import { createHandler } from '../create-handler'
import type { AppInfoService } from '../../services/app-info.service'
import type { AppUpdateService } from '../../services/app-update.service'

export function registerAppHandlers(deps: {
  appInfo: AppInfoService
  appUpdate: AppUpdateService
}): void {
  createHandler('app:get-info', { handle: () => deps.appInfo.get() })
  createHandler('app:check-update', { handle: () => deps.appUpdate.check() })
}
