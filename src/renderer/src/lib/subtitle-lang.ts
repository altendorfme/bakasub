/** Suffixes that describe the subtitle, not its language (`ep01.pt-BR.forced.ass`). */
const FLAGS = new Set(['forced', 'sdh', 'cc', 'hi', 'default', 'full', 'signs', 'bakasub'])
const TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i
const KNOWN = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })

/**
 * Language from the file name suffix, canonical BCP-47 (`ep01.pt-BR.ass` -> `pt-BR`,
 * `Show.S01E01.en.forced.srt` -> `en`). `null` when there is none.
 */
export function guessSubtitleLanguage(path: string): string | null {
  const name = path.split(/[\\/]/).pop() ?? path
  const parts = name.split('.').slice(1, -1).reverse()
  for (const part of parts) {
    if (FLAGS.has(part.toLowerCase())) continue
    if (!TAG.test(part)) return null
    try {
      const tag = Intl.getCanonicalLocales(part)[0]
      // Only real languages: "Dr.Who.srt" must not read as the language "who".
      return tag && KNOWN.of(tag.split('-')[0]) ? tag : null
    } catch {
      return null
    }
  }
  return null
}
