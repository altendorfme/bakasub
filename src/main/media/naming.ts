import { access } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { canonicalTag } from './languages'

const KNOWN = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })

/** Sufixo de idioma antes da extensão (`ep01.pt-BR.ass` -> `pt-BR`). Só tags curtas e válidas. */
export function langFromFilename(path: string): string | undefined {
  const stem = basename(path, extname(path))
  // Subtag primária em minúsculas (tags de cena como "WEB"/"DUAL" são maiúsculas) e conhecida pelo ICU.
  const m = /\.([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/.exec(stem)
  if (!m || !KNOWN.of(m[1].split('-')[0])) return undefined
  return canonicalTag(m[1])
}

/** Nome-base sem extensão e sem um sufixo de idioma já presente. */
function stemOf(path: string): string {
  const stem = basename(path, extname(path))
  const lang = langFromFilename(path)
  return lang ? stem.slice(0, stem.lastIndexOf('.')) : stem
}

export const outputNames = {
  muxed: (source: string, lang: string): string => `${stemOf(source)}.${lang}.mkv`,
  subtitle: (source: string, lang: string, ext = extname(source).slice(1)): string =>
    `${stemOf(source)}.${lang}.${ext}`,
  extracted: (source: string, trackId: number, lang: string | undefined, ext: string): string =>
    `${stemOf(source)}.${trackId}.${lang ?? 'und'}.${ext}`,
  /** Compatível com players: `<base>.<lang>.<ext>` (`index` = `<base>.<lang>.<n>.<ext>`). */
  extractedForPlayer: (
    source: string,
    lang: string | undefined,
    ext: string,
    index?: number
  ): string => `${stemOf(source)}.${lang ?? 'und'}${index === undefined ? '' : `.${index}`}.${ext}`,
  /** Temporário no MESMO diretório (rename atômico), oculto em Unix. */
  partial: (finalPath: string): string =>
    join(
      dirname(finalPath),
      `.${basename(finalPath, extname(finalPath))}.bakasub-partial${extname(finalPath)}`
    )
}

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )

/**
 * Nomes das faixas extraídas no modo `player`, na ordem dada. Idioma único na lista:
 * `<base>.<lang>.<ext>`; repetido: `<base>.<lang>.<n>.<ext>` (n = ordem da faixa dentro do idioma,
 * a partir de 1), de modo que duas faixas nunca resultem no mesmo nome.
 */
export function playerNames(
  source: string,
  tracks: readonly { language?: string; format: string }[]
): string[] {
  const key = (t: { language?: string }): string => t.language ?? 'und'
  const total = new Map<string, number>()
  for (const t of tracks) total.set(key(t), (total.get(key(t)) ?? 0) + 1)
  const seen = new Map<string, number>()
  return tracks.map((t) => {
    const n = (seen.get(key(t)) ?? 0) + 1
    seen.set(key(t), n)
    return outputNames.extractedForPlayer(
      source,
      t.language,
      t.format,
      (total.get(key(t)) ?? 0) > 1 ? n : undefined
    )
  })
}

/** Destino da saída: com `overwrite` o nome exato (exceto se for o próprio `protect`); senão único. */
export async function resolveOutputPath(
  dir: string,
  name: string,
  opts: { overwrite?: boolean; protect?: string } = {}
): Promise<string> {
  const target = join(dir, name)
  if (opts.overwrite && target !== opts.protect) return target
  return uniquePath(dir, name)
}

/** `dir/name`, ou `name (2)`, `name (3)`… até um nome livre. */
export async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = basename(name, ext)
  let candidate = join(dir, name)
  for (let n = 2; await exists(candidate); n++) candidate = join(dir, `${stem} (${n})${ext}`)
  return candidate
}
