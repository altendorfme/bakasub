import { shell } from 'electron'
import { z } from 'zod'
import { AppError } from '../../errors'
import { isAllowedExternalUrl } from '../../services/external-links'
import { createHandler } from '../create-handler'
import type { AppInfoService } from '../../services/app-info.service'
import type { AppUpdater, AutoCheckHandle } from '../../services/app-updater'

export function registerAppHandlers(deps: {
  appInfo: AppInfoService
  appUpdate: AppUpdater
  autoCheck: Pick<AutoCheckHandle, 'onboardingFinished'>
}): void {
  createHandler('app:get-info', { handle: () => deps.appInfo.get() })
  createHandler('app:check-update', { handle: () => deps.appUpdate.check() })
  createHandler('app:get-update-state', { handle: () => deps.appUpdate.getStatus() })
  createHandler('app:download-update', { handle: () => deps.appUpdate.download() })
  createHandler('app:cancel-update-download', { handle: () => deps.appUpdate.cancelDownload() })
  createHandler('app:install-update', {
    input: z.object({ confirmJobs: z.boolean().optional() }).strict(),
    handle: (opts) => deps.appUpdate.install(opts)
  })
  createHandler('app:onboarding-finished', {
    handle: () => {
      deps.autoCheck.onboardingFinished()
      return { acknowledged: true as const }
    }
  })
  createHandler('app:open-external', {
    input: z.object({ url: z.string().max(2048) }),
    handle: async ({ url }) => {
      if (!isAllowedExternalUrl(url)) throw new AppError('URL_NOT_ALLOWED', 'URL not allowed')
      await shell.openExternal(url)
      return { opened: true as const }
    }
  })
}
