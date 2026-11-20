import type { SubtitleTrackInfo } from '@shared/ipc-contract'
import { guessSubtitleLanguage } from './subtitle-lang'

/** ISO 639-2 codes mkvtoolnix may report, mapped to the 639-1 base of BCP-47 tags. */
const ISO2: Readonly<Record<string, string>> = {
  por: 'pt',
  eng: 'en',
  spa: 'es',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh',
  zho: 'zh',
  rus: 'ru',
  ara: 'ar',
  pol: 'pl',
  tur: 'tr',
  dut: 'nl',
  nld: 'nl',
  swe: 'sv',
  ukr: 'uk',
  vie: 'vi',
  tha: 'th',
  ind: 'id',
  hin: 'hi'
}

const base = (tag: string | undefined): string => {
  const b = (tag ?? '').toLowerCase().split('-')[0]
  return ISO2[b] ?? b
}

export type ExistingTarget = { where: 'track'; track: SubtitleTrackInfo } | { where: 'file' }

/**
 * The source already has a subtitle in the target language: a track of the video, or a
 * subtitle file whose name says so (`ep01.pt-BR.srt`). Compared by base language, so `pt`,
 * `por` and `pt-BR` all count for a `pt-BR` target.
 */
export function existingTarget(
  target: string | null,
  source: { path: string; kind: 'video' | 'subtitle'; tracks?: readonly SubtitleTrackInfo[] }
): ExistingTarget | null {
  if (!target) return null
  const want = base(target)
  if (source.kind === 'subtitle')
    return base(guessSubtitleLanguage(source.path) ?? undefined) === want ? { where: 'file' } : null
  const track = source.tracks?.find((t) => t.language && base(t.language) === want)
  return track ? { where: 'track', track } : null
}
