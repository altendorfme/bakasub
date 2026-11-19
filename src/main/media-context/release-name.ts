/** What a scene/fansub file name says about its media. Only `title` is always present. */
export interface ReleaseInfo {
  title: string
  year?: number
  season?: number
  episode?: number
  /** Anime numbering without season (`Show - 28`): the user maps it to season/episode. */
  absoluteEpisode?: number
}

const MEDIA_EXT = /\.(mkv|mp4|avi|m4v|webm|srt|ass|ssa|vtt|sub|idx|sup)$/i
/** Trailing subtitle tags: `.en`, `.pt-BR`, `.forced`, `.sdh`… (lowercase language codes only). */
const SUB_SUFFIX = /\.(?:[a-z]{2,3}(?:-[A-Za-z]{2,4})?|forced|sdh|cc|hi)$/
const QUALITY =
  /\b(?:2160p|1080p|720p|576p|480p|4k|uhd|hdr|web-?dl|web-?rip|web|blu-?ray|bdrip|brrip|hdtv|dvdrip|remux|x264|x265|h\.?264|h\.?265|hevc|avc|aac|ddp?\d|dts|atmos|proper|repack|multi|dual|10bit)\b/i
const SXXEYY = /\bS(\d{1,2}) ?E(\d{1,3})\b/i
const NXNN = /\b(\d{1,2})x(\d{2,3})\b/
const ABSOLUTE = / - (\d{1,4})(?:v\d)?\b/
const YEAR = /\b(?:19|20)\d{2}\b/g

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function stripExtensions(name: string): string {
  let s = name.replace(MEDIA_EXT, '')
  // Up to two tags: `.pt-BR.forced`.
  for (let i = 0; i < 2 && SUB_SUFFIX.test(s); i++) s = s.replace(SUB_SUFFIX, '')
  return s
}

/**
 * Deterministic parser for the usual scene and fansub patterns: `Title.S01E05`, `Title.1x05`,
 * `Title.2024`, `Title (2016)`, `[Group] Title - 28 [CRC]`. Cuts the title at the first episode
 * marker, year or quality tag; the year is the last one in that title region that is not the
 * first word (so `2001 A Space Odyssey 1968` and `Blade Runner 2049 2017` work).
 */
export function parseReleaseName(path: string): ReleaseInfo {
  const raw = stripExtensions(baseName(path))
  // Brackets: fansub group, CRC, quality. A year in parentheses is kept as a plain word.
  const text = raw
    .replace(/\((\d{4})\)/g, ' $1 ')
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const out: Omit<ReleaseInfo, 'title'> = {}
  let cut = text.length

  const se = SXXEYY.exec(text) ?? NXNN.exec(text)
  if (se) {
    out.season = Number(se[1])
    out.episode = Number(se[2])
    cut = se.index
  } else {
    const abs = ABSOLUTE.exec(text)
    if (abs) {
      out.absoluteEpisode = Number(abs[1])
      cut = abs.index
    }
  }

  const q = QUALITY.exec(text)
  if (q && q.index > 0) cut = Math.min(cut, q.index)

  const years = [...text.slice(0, cut).matchAll(YEAR)].filter((m) => m.index > 0)
  const year = years.at(-1)
  if (year) {
    out.year = Number(year[0])
    cut = year.index
  }

  const title = text
    .slice(0, cut)
    .replace(/[\s-]+$/, '')
    .trim()
  return { title: title || text, ...out }
}
