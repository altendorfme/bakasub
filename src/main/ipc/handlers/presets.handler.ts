import { BrowserWindow, dialog } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { AppError } from '../../errors'
import { MAX_PRESET_FILE_BYTES } from '../../presets/preset-file'
import type { PresetService } from '../../presets/preset.service'
import { PresetInputSchema } from '../../presets/preset.schema'
import { createHandler } from '../create-handler'

const id = z.string().min(1).max(64)
const JSON_FILTER = [{ name: 'BakaSub presets', extensions: ['json'] }]

/** Nome sugerido no diálogo de salvar (sem caracteres inválidos em Windows/Linux). */
function suggestedName(names: string[]): string {
  const base = names.length === 1 ? names[0] : 'bakasub-presets'
  // eslint-disable-next-line no-control-regex -- controles são inválidos em nomes de arquivo
  return `${base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 80)}.json`
}

export function registerPresetHandlers(deps: { presets: PresetService }): void {
  createHandler('presets:list', { handle: () => deps.presets.list() })
  createHandler('presets:create', {
    input: PresetInputSchema,
    handle: (preset) => deps.presets.create(preset)
  })
  createHandler('presets:update', {
    input: z.object({ id, preset: PresetInputSchema }),
    handle: ({ id, preset }) => deps.presets.update(id, preset)
  })
  createHandler('presets:duplicate', {
    input: z.object({ id, name: z.string().trim().min(1).max(80).optional() }),
    handle: ({ id, name }) => deps.presets.duplicate(id, name)
  })
  createHandler('presets:delete', {
    input: z.object({ id }),
    handle: async ({ id }) => {
      await deps.presets.delete(id)
      return { deleted: true as const }
    }
  })

  // Arquivos só pelo Main, via diálogos nativos: o renderer nunca escolhe um caminho.
  createHandler('presets:export', {
    input: z.object({ ids: z.array(id).min(1).max(500) }),
    handle: async ({ ids }, event) => {
      const file = await deps.presets.exportPresets(ids)
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        defaultPath: suggestedName(file.presets.map((p) => p.name)),
        filters: JSON_FILTER
      }
      const res = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)
      if (res.canceled || !res.filePath) return { path: null, count: 0 }
      await writeFile(res.filePath, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
      return { path: res.filePath, count: file.presets.length }
    }
  })

  createHandler('presets:import', {
    input: z.object({ onConflict: z.enum(['rename', 'skip']).optional() }),
    handle: async ({ onConflict }, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = { properties: ['openFile' as const], filters: JSON_FILTER }
      const res = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      const path = res.canceled ? undefined : res.filePaths[0]
      if (!path) return { path: null, imported: [], skipped: [] }
      const st = await stat(path)
      if (!st.isFile() || st.size > MAX_PRESET_FILE_BYTES)
        throw new AppError('INVALID_PRESET_FILE', st.isFile() ? 'too-large' : 'not-a-file')
      const result = await deps.presets.importPresets(await readFile(path, 'utf8'), { onConflict })
      return { path, ...result }
    }
  })
}
