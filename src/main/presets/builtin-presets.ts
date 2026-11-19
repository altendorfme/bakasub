import type { Preset } from '../../shared/ipc-contract'

/**
 * Presets embutidos: imutáveis, versionados com o app (melhorar um prompt numa atualização não
 * exige migração; jobs congelam uma cópia). Sem modelo, glossário ou idioma: usam os padrões das
 * configurações. O texto é instrução para o modelo (inglês) e é complementado pelas regras fixas
 * de marcadores, que vêm depois e não podem ser desligadas.
 */
const MOVIE = `Media type: feature film.
- Write natural, idiomatic dialogue, as in a professional theatrical subtitle.
- Keep each character's tone and register consistent (formal vs. informal address, how they speak).
- Adapt slang, idioms, wordplay and jokes to natural equivalents instead of translating literally.
- Keep lines short and easy to read at a glance; prefer concise phrasing over completeness.
- Do not censor or soften profanity, insults or slurs; match their intensity.`

const SERIES = `Media type: TV series episode.
- Write natural, idiomatic dialogue, as in a professional streaming subtitle.
- Keep names, nicknames, forms of address and recurring terms consistent throughout the episode.
- Keep each character's voice and register consistent; adapt slang and idioms to natural equivalents.
- "Previously on" recaps, titles and on-screen text must stay concise.
- Keep lines short and easy to read at a glance.
- Do not censor or soften profanity; match its intensity.`

const ANIME = `Media type: anime (Japanese animation).
- Keep Japanese honorifics (-san, -kun, -chan, -sama, -senpai, -sensei, -dono) attached to names.
- Keep culturally specific terms without a natural equivalent (e.g. onii-chan, senpai, itadakimasu, baka) unless the glossary says otherwise.
- Keep the names of attacks, techniques, transformations, organizations and places as in the source.
- Preserve the expressive, energetic tone, exclamations and each character's speech quirks (catchphrases, verbal tics, archaic or rough speech).
- Translate onomatopoeia and on-screen captions only when they carry meaning.
- Keep lines short and easy to read at a glance.`

const DOCUMENTARY = `Media type: documentary.
- Prioritize accuracy over style: use the correct technical, scientific and historical terminology in the target language.
- Keep numbers, dates, measurements, units, quantities and proper names exactly as stated; do not convert units.
- Use a neutral, formal register for narration; keep interviews natural but faithful to what is said.
- Keep the titles of works, institutions and species in their established target-language form when one exists.
- Keep lines short and easy to read at a glance.`

function builtin(
  id: string,
  name: string,
  mediaType: Preset['mediaType'],
  temperature: number,
  prompt: string
): Readonly<Preset> {
  return Object.freeze({
    id,
    builtin: true,
    name,
    mediaType,
    temperature,
    prompt,
    glossary: Object.freeze([]) as unknown as Preset['glossary'],
    model: null,
    targetLang: null,
    copiedFrom: null,
    createdAt: null
  })
}

export const BUILTIN_PRESETS: readonly Readonly<Preset>[] = Object.freeze([
  builtin('builtin:movie', 'Movie', 'movie', 0.35, MOVIE),
  builtin('builtin:series', 'Series', 'series', 0.35, SERIES),
  builtin('builtin:anime', 'Anime', 'anime', 0.45, ANIME),
  builtin('builtin:documentary', 'Documentary', 'documentary', 0.2, DOCUMENTARY)
])

export const isBuiltinId = (id: string): boolean => id.startsWith('builtin:')
