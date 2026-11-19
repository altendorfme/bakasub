import { shell } from 'electron'
import { z } from 'zod'
import { AppError } from '../../errors'
import { isAllowedExternalUrl } from '../../services/external-links'
import { createHandler } from '../create-handler'
import type { AppInfoService } from '../../services/app-info.service'
import type { AppUpdateService } from '../../services/app-update.service'

export function registerAppHandlers(deps: {
  appInfo: AppInfoService
  appUpdate: AppUpdateService
}): void {
  createHandler('app:get-info', { handle: () => deps.appInfo.get() })
  createHandler('app:check-update', { handle: () => deps.appUpdate.check() })
  createHandler('app:open-external', {
    input: z.object({ url: z.string().max(2048) }),
    handle: async ({ url }) => {
      if (!isAllowedExternalUrl(url)) throw new AppError('URL_NOT_ALLOWED', 'URL not allowed')
      await shell.openExternal(url)
      return { opened: true as const }
    }
  })
}
