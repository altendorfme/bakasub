import type { JobCreateRequest } from '@shared/ipc-contract'
import { guessSubtitleLanguage } from '@renderer/lib/subtitle-lang'

export interface MuxRow {
  path: string
  /** `''` until chosen. */
  language: string
  /** Language came from the file name. */
  guessed: boolean
  name: string
  isDefault: boolean
}

export const MAX_MUX_SUBTITLES = 32

/** New rows for the picked files (duplicates ignored); the first subtitle ever added is the default. */
export function addRows(rows: readonly MuxRow[], paths: readonly string[]): MuxRow[] {
  const known = new Set(rows.map((r) => r.path))
  const fresh = paths
    .filter((p) => !known.has(p))
    .map((path): MuxRow => {
      const lang = guessSubtitleLanguage(path)
      return { path, language: lang ?? '', guessed: lang !== null, name: '', isDefault: false }
    })
  const next = [...rows, ...fresh].slice(0, MAX_MUX_SUBTITLES)
  return next.some((r) => r.isDefault) || next.length === 0
    ? next
    : next.map((r, i) => ({ ...r, isDefault: i === 0 }))
}

/** At most one default. */
export const setDefaultRow = (rows: readonly MuxRow[], path: string): MuxRow[] =>
  rows.map((r) => ({ ...r, isDefault: r.path === path ? !r.isDefault : false }))

export const muxReady = (source: string | null, rows: readonly MuxRow[]): boolean =>
  !!source && rows.length > 0 && rows.every((r) => r.language)

export function buildMuxRequest(
  source: string,
  rows: readonly MuxRow[],
  o: { outputDir: string | null; setDefault: boolean; keepOriginalSubtitles: boolean }
): JobCreateRequest {
  return {
    kind: 'mux',
    source,
    subtitles: rows.map((r) => ({
      path: r.path,
      language: r.language,
      ...(r.name.trim() ? { name: r.name.trim() } : {}),
      ...(r.isDefault ? { default: true } : {})
    })),
    ...(o.outputDir ? { outputDir: o.outputDir } : {}),
    options: { setDefault: o.setDefault, keepOriginalSubtitles: o.keepOriginalSubtitles }
  }
}
