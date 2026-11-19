import { z } from 'zod'
import type { Preset, PresetInput } from '../../shared/ipc-contract'
import { AppError } from '../errors'
import { PresetInputSchema, type PresetData } from './preset.schema'

export const PRESET_FILE_FORMAT = 'bakasub-presets'
export const PRESET_FILE_VERSION = 1
export const MAX_PRESET_FILE_BYTES = 1024 * 1024
export const MAX_PRESETS_PER_FILE = 500

/**
 * Arquivo de troca de presets. Sem ids, `builtin`, `copiedFrom` ou datas: um preset importado é
 * sempre um preset personalizado novo. `version` permite migrar o formato no futuro.
 */
export interface PresetFile {
  format: typeof PRESET_FILE_FORMAT
  version: typeof PRESET_FILE_VERSION
  exportedAt: string
  presets: PresetInput[]
}

export function buildPresetFile(presets: readonly Preset[], now = new Date()): PresetFile {
  return {
    format: PRESET_FILE_FORMAT,
    version: PRESET_FILE_VERSION,
    exportedAt: now.toISOString(),
    presets: presets.map((p) => ({
      name: p.name,
      mediaType: p.mediaType,
      temperature: p.temperature,
      prompt: p.prompt,
      glossary: [...p.glossary],
      model: p.model,
      targetLang: p.targetLang
    }))
  }
}

const Envelope = z.object({
  format: z.literal(PRESET_FILE_FORMAT),
  version: z.literal(PRESET_FILE_VERSION),
  presets: z.array(z.unknown()).max(MAX_PRESETS_PER_FILE)
})

/** Campos opcionais no arquivo (escrito à mão ou por versões antigas) viram `null`. */
const FileEntry = z
  .looseObject({ model: z.unknown().optional(), targetLang: z.unknown().optional() })
  .transform((e) => ({ ...e, model: e.model ?? null, targetLang: e.targetLang ?? null }))

export interface ParsedPresetFile {
  valid: { index: number; data: PresetData }[]
  invalid: { index: number; name?: string; reason: string }[]
}

/**
 * Valida o envelope (lança `INVALID_PRESET_FILE`) e cada preset com o MESMO schema da criação.
 * Entradas inválidas são relatadas, não derrubam o arquivo inteiro; campos desconhecidos somem.
 */
export function parsePresetFile(text: string): ParsedPresetFile {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new AppError('INVALID_PRESET_FILE', 'not-json')
  }
  const env = Envelope.safeParse(json)
  if (!env.success) throw new AppError('INVALID_PRESET_FILE', 'not-a-preset-file')

  const out: ParsedPresetFile = { valid: [], invalid: [] }
  env.data.presets.forEach((raw, index) => {
    const entry = FileEntry.safeParse(raw)
    const parsed = entry.success ? PresetInputSchema.safeParse(entry.data) : null
    if (parsed?.success) out.valid.push({ index, data: parsed.data })
    else {
      const name = (raw as { name?: unknown } | null)?.name
      out.invalid.push({
        index,
        ...(typeof name === 'string' ? { name } : {}),
        reason: parsed
          ? parsed.error.issues.map((i) => i.path.join('.') || i.message).join(', ')
          : 'not-an-object'
      })
    }
  })
  return out
}
