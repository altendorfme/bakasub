/**
 * English strings, the reference dictionary. Other locales (PT-BR in F4) must provide the same keys:
 * `Dictionary` is derived from this object so a missing key is a type error.
 */
export const en = {
  'meta.title': 'BakaSub: AI subtitle translator for MKV',
  'meta.description':
    'Extract, translate with AI and re-mux the subtitles of your .mkv videos, from a desktop app, on your own machine.',
  'nav.home': 'BakaSub home',
  'nav.github': 'GitHub',
  'nav.githubLabel': 'BakaSub on GitHub',
  'nav.primary': 'Main',
  'hero.kicker': 'AI subtitle translator',
  // U+2011 non-breaking hyphen: keeps "re‑mux" on one line at narrow widths.
  'hero.titleStrong': 'Extract, translate with AI and re\u2011mux',
  'hero.titleRest': 'the subtitles of your .mkv videos.',
  'hero.lead':
    'A desktop app that runs on your own machine. Bring your OpenRouter key; your files never leave your computer.',
  'hero.download': 'Download',
  'hero.source': 'View source',
  'hero.platforms': 'Windows x64 · Linux x64 · Free and open source',
  'footer.license': 'Free and open source software, licensed under',
  'footer.releases': 'All releases',
  'footer.coffee': 'Buy me a coffee',
  'footer.source': 'Source code'
} as const

export type Dictionary = { [K in keyof typeof en]: string }
export type TranslationKey = keyof Dictionary
