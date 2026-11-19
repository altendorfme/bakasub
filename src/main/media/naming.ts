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

/** `dir/name`, ou `name (2)`, `name (3)`… até um nome livre. */
export async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = basename(name, ext)
  let candidate = join(dir, name)
  for (let n = 2; await exists(candidate); n++) candidate = join(dir, `${stem} (${n})${ext}`)
  return candidate
}
