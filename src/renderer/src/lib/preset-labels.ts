import type { TFunction } from 'i18next'
import type { Preset } from '@shared/ipc-contract'

const BUILTIN = ['movie', 'series', 'anime', 'documentary'] as const
type Builtin = (typeof BUILTIN)[number]
const isBuiltinKey = (k: string): k is Builtin => (BUILTIN as readonly string[]).includes(k)

/** Built-ins are named in the app language; custom presets keep the name the user gave. */
export function presetLabel(p: Pick<Preset, 'id' | 'name' | 'builtin'>, t: TFunction): string {
  const key = p.id.replace(/^builtin:/, '')
  return p.builtin && isBuiltinKey(key) ? t(`presetNames.${key}`) : p.name
}

/** The four known media types in the app language; any other free text as typed. */
export function mediaTypeLabel(type: string, t: TFunction): string {
  const key = type.trim().toLowerCase()
  return isBuiltinKey(key) ? t(`mediaTypes.${key}`) : type
}

/** "Série (cópia)", then "Série (cópia 2)"… avoiding names already taken (case-insensitive). */
export function copyName(base: string, taken: readonly string[], t: TFunction): string {
  const used = new Set(taken.map((n) => n.toLowerCase()))
  for (let i = 1; ; i++) {
    const name =
      i === 1 ? t('presets.copyOf', { name: base }) : t('presets.copyOfN', { name: base, n: i })
    if (!used.has(name.toLowerCase())) return name
  }
}
