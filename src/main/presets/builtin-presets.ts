import type { Preset } from '../../shared/ipc-contract'

/**
 * Presets embutidos: imutáveis, versionados com o app (melhorar um prompt numa atualização não
 * exige migração; jobs congelam uma cópia). Sem modelo, glossário ou idioma: usam os padrões das
 * configurações. O texto é instrução para o modelo (inglês) e é complementado pelas regras fixas
 * de marcadores, que vêm depois e não podem ser desligadas.
 *
 * Cada prompt = cabeçalho + regras do tipo de mídia + trechos comuns abaixo. Os trechos comuns
 * existem para as regras não divergirem entre presets (antes, Anime não tinha adaptação de
 * piadas nem consistência de apelidos). O que vale para qualquer estilo (marcadores, formato,
 * idioms/gírias, imperativo, ortografia do idioma-alvo) mora no system prompt, não aqui, para a
 * mesma regra não existir em dois lugares.
 *
 * Mudar qualquer texto aqui invalida a Job Memory dos presets afetados (`prompt_hash`).
 */

/** Todo tipo de mídia: termos recorrentes e legibilidade. */
const SHARED = [
  '- Keep names, nicknames (e.g. "Bro", "Boss"), forms of address and recurring terms consistent: once a term is rendered one way, reuse that exact rendering every time.',
  '- Keep lines short and easy to read at a glance; prefer concise phrasing over completeness.'
]

/**
 * Ficção (filme, série, anime): voz dos personagens, trocadilhos e palavrões. Idioms, gírias e
 * imperativo NÃO entram aqui: são a regra fixa 6 do system prompt (`prompt-builder.ts`).
 */
const FICTION = [
  "- Keep each character's voice and register consistent (formal vs. informal address, how they speak).",
  '- Adapt wordplay, puns and jokes so they still work in the target language, even if the wording changes.',
  '- Do not censor or soften profanity, insults or slurs; match their intensity.'
]

const compose = (header: string, ...rules: readonly string[][]): string =>
  [header, ...rules.flat()].join('\n')

const MOVIE = compose(
  'Media type: feature film.',
  ['- Write natural, idiomatic dialogue, as in a professional theatrical subtitle.'],
  FICTION,
  SHARED
)

const SERIES = compose(
  'Media type: TV series episode.',
  [
    '- Write natural, idiomatic dialogue, as in a professional streaming subtitle.',
    '- "Previously on" recaps, titles and on-screen text must stay concise.'
  ],
  FICTION,
  SHARED
)

const ANIME = compose(
  'Media type: anime (Japanese animation).',
  [
    '- Keep Japanese honorifics (-san, -kun, -chan, -sama, -senpai, -sensei, -dono) attached to names.',
    '- Keep Japanese culturally specific terms without a natural equivalent (e.g. onii-chan, senpai, itadakimasu, baka) unless the glossary says otherwise. Idioms and slang written in the source language are not such terms: adapt them as usual.',
    '- Keep the proper names of attacks, techniques, mecha, transformations and organizations exactly as written in the source line; do not translate them.',
    '- Translate in-world common nouns by their plain meaning (e.g. "the surface" means the ground above, not "the world").',
    "- Preserve the expressive, energetic tone, exclamations and each character's speech quirks (catchphrases, verbal tics, archaic or rough speech).",
    '- Translate onomatopoeia only when it carries meaning. Translate on-screen captions and signs as complete, natural titles (e.g. a "Next Time" card is a next-episode preview title, not a fragment).'
  ],
  FICTION,
  SHARED
)

const DOCUMENTARY = compose(
  'Media type: documentary.',
  [
    '- Prioritize accuracy over style: use the correct technical, scientific and historical terminology in the target language.',
    '- Keep numbers, dates, measurements, units, quantities and proper names exactly as stated; do not convert units.',
    '- Use a neutral, formal register for narration; keep interviews natural but faithful to what is said, including strong language.',
    '- Keep the titles of works, institutions and species in their established target-language form when one exists.'
  ],
  SHARED
)

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
    copiedFrom: null,
    createdAt: null
  })
}

export const BUILTIN_PRESETS: readonly Readonly<Preset>[] = Object.freeze([
  builtin('builtin:movie', 'Movie', 'Movie', 0.35, MOVIE),
  builtin('builtin:series', 'Series', 'Series', 0.35, SERIES),
  builtin('builtin:anime', 'Anime', 'Anime', 0.4, ANIME),
  builtin('builtin:documentary', 'Documentary', 'Documentary', 0.2, DOCUMENTARY)
])

export const isBuiltinId = (id: string): boolean => id.startsWith('builtin:')
