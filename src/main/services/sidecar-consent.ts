import { BrowserWindow, dialog } from 'electron'
import type { ConsentGate, ConsentRequest } from '../sidecars/types'

/**
 * Diálogo nativo (fora do renderer): um renderer comprometido não consegue aprová-lo sozinho.
 * Padrão e botão de cancelar = "Cancelar".
 */
export class NativeConsentGate implements ConsentGate {
  async confirmDownload(request: ConsentRequest): Promise<boolean> {
    const lines = request.items.map(
      (i) => `• ${i.tools.map((t) => `${t.name} ${t.version}`).join(', ')}  ←  ${i.host}`
    )
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      title: 'Componentes necessários',
      message: 'O BakaSub precisa baixar ferramentas externas. Deseja continuar?',
      detail: [
        ...lines,
        '',
        'Os arquivos têm o SHA-256 verificado antes de serem instalados em:',
        request.installDir
      ].join('\n'),
      buttons: ['Baixar e instalar', 'Cancelar'],
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
