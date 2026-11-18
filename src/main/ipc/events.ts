import { BrowserWindow } from 'electron'
import type { EventChannel, IpcEventContract } from '../../shared/ipc-contract'

export function emitToRenderers<C extends EventChannel>(
  channel: C,
  payload: IpcEventContract[C]
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
