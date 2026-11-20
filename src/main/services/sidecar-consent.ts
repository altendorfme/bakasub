import { BrowserWindow, dialog } from 'electron'
import type { ConsentGate, ConsentRequest } from '../sidecars/types'
import { consentText, type ConsentLanguage } from './sidecar-consent-text'

/**
 * Diálogo nativo (fora do renderer): um renderer comprometido não consegue aprová-lo sozinho.
 * Padrão e botão de cancelar = "Cancelar". O texto segue o idioma do app.
 */
export class NativeConsentGate implements ConsentGate {
  constructor(private readonly language: () => Promise<ConsentLanguage>) {}

  async confirmDownload(request: ConsentRequest): Promise<boolean> {
    const text = consentText(await this.language().catch(() => 'en' as const))
    const lines = request.items.map(
      (i) => `• ${i.tools.map((t) => `${t.name} ${t.version}`).join(', ')}  ←  ${i.host}`
    )
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      title: text.title,
      message: text.message,
      detail: [...lines, '', text.checksum, request.installDir].join('\n'),
      buttons: [text.install, text.cancel],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    }
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)
    return response === 0
  }
}
