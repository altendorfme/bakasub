import { BrowserWindow, Notification } from 'electron'
import type { NavigationTarget } from '../../shared/ipc-contract'
// Mesmo PNG da janela (o nativeImage não lê SVG). Só o Linux usa o ícone do payload: Windows e
// macOS mostram o ícone do app (no Windows, via AppUserModelId = `appId` do electron-builder).
import icon from '../../../resources/icon.png?asset'
import { NotificationService, type MainWindowPort } from './notification.service'
import type { NotificationKind } from './notification.service'

export interface NotificationsOptions {
  /** A janela principal atual (ou `null` se não existe, ex.: macOS com todas fechadas). */
  mainWindow: () => BrowserWindow | null
  /** Recria a janela (macOS sem janelas abertas). */
  createWindow: () => BrowserWindow
  setting: (key: 'notifications.enabled' | `notifications.${NotificationKind}`) => Promise<boolean>
  log: { warn(...a: unknown[]): void }
}

/** Liga o `NotificationService` ao Electron. Só o composition root importa este arquivo. */
export function createNotificationService(o: NotificationsOptions): NotificationService {
  const alive = (): BrowserWindow | null => {
    const w = o.mainWindow()
    return w && !w.isDestroyed() ? w : null
  }
  const window: MainWindowPort = {
    isFocused: () => {
      const w = alive()
      return !!w && w.isVisible() && !w.isMinimized() && w.isFocused()
    },
    reveal: (target: NavigationTarget) => {
      let w = alive()
      const fresh = !w
      w ??= o.createWindow()
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
      const send = (): void => {
        if (!w.isDestroyed()) w.webContents.send('app:navigate', target)
      }
      // Janela recém-criada: o renderer só escuta depois de carregar.
      if (fresh || w.webContents.isLoading()) w.webContents.once('did-finish-load', send)
      else send()
    }
  }
  return new NotificationService({
    isSupported: () => Notification.isSupported(),
    create: ({ title, body }) =>
      new Notification({
        title,
        body,
        silent: false,
        ...(process.platform === 'linux' ? { icon } : {})
      }),
    window,
    enabled: async (kind) =>
      (await o.setting('notifications.enabled')) && (await o.setting(`notifications.${kind}`)),
    log: o.log
  })
}
