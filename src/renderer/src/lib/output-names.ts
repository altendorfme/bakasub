import type { ExtractNaming, OutputMode } from '@shared/ipc-contract'
import { guessSubtitleLanguage } from './subtitle-lang'

/** Mirrors `src/main/media/naming.ts`: this is a preview, the Main decides the final name. */

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/** File name without extension and without a language suffix already present (`ep01.en` → `ep01`). */
export function stemOf(path: string): string {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const lang = guessSubtitleLanguage(path)
  return lang && stem.includes('.') ? stem.slice(0, stem.lastIndexOf('.')) : stem
}

/** Translated subtitle written next to the video: `Episode.pt-BR.ass`. */
export const translatedName = (source: string, lang: string, ext: string): string =>
  `${stemOf(source)}.${lang}.${ext}`

export interface NamedTrack {
  id: number
  language?: string
  format: string
}

/**
 * Names of the extracted tracks, in order. `player`: `<base>.<lang>.<ext>`, a repeated language
 * becomes `<base>.<lang>.<n>.<ext>`; `track`: `<base>.<id>.<lang>.<ext>`.
 */
export function extractedNames(
  source: string,
  tracks: readonly NamedTrack[],
  naming: ExtractNaming
): string[] {
  const stem = stemOf(source)
  if (naming === 'track')
    return tracks.map((t) => `${stem}.${t.id}.${t.language ?? 'und'}.${t.format}`)
  const key = (t: NamedTrack): string => t.language ?? 'und'
  const total = new Map<string, number>()
  for (const t of tracks) total.set(key(t), (total.get(key(t)) ?? 0) + 1)
  const seen = new Map<string, number>()
  return tracks.map((t) => {
    const n = (seen.get(key(t)) ?? 0) + 1
    seen.set(key(t), n)
    return `${stem}.${key(t)}${(total.get(key(t)) ?? 0) > 1 ? `.${n}` : ''}.${t.format}`
  })
}

/** Languages that more than one of the tracks share (they need a `.n` suffix in `player` naming). */
export function repeatedLanguages(tracks: readonly { language?: string }[]): string[] {
  const count = new Map<string, number>()
  for (const t of tracks) count.set(t.language ?? 'und', (count.get(t.language ?? 'und') ?? 0) + 1)
  return [...count].filter(([, n]) => n > 1).map(([lang]) => lang)
}

/** Files a translation writes: the MKV (`mux`), the subtitle (`subtitle`) or both. */
export function translateOutputNames(
  source: string,
  lang: string,
  subtitleExt: string,
  mode: OutputMode
): string[] {
  const stem = stemOf(source)
  return [
    ...(mode !== 'subtitle' ? [`${stem}.${lang}.mkv`] : []),
    ...(mode !== 'mux' ? [`${stem}.${lang}.${subtitleExt}`] : [])
  ]
}

/** Folder the output goes to: the chosen one, else the source's own. */
export function outputFolder(source: string, outputDir: string | null): string {
  if (outputDir) return outputDir
  const i = Math.max(source.lastIndexOf('/'), source.lastIndexOf('\\'))
  return i > 0 ? source.slice(0, i) : '.'
}
