import { app } from 'electron'
import type { AppInfo } from '../../shared/ipc-contract'

export class AppInfoService {
  get(): AppInfo {
    return {
      name: app.getName(),
      version: app.getVersion(),
      isDev: !app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      userDataPath: app.getPath('userData')
    }
  }
}
