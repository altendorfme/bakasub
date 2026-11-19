/**
 * ISO 639-2 (bibliográfico e terminológico) -> BCP-47 para os idiomas comuns em releases.
 * Fora da tabela (ou `und`/`mul`/`zxx`) => `undefined`: o idioma fica desconhecido.
 */
const ISO_639_2: Readonly<Record<string, string>> = {
  ara: 'ar',
  bul: 'bg',
  cat: 'ca',
  chi: 'zh',
  zho: 'zh',
  cze: 'cs',
  ces: 'cs',
  dan: 'da',
  dut: 'nl',
  nld: 'nl',
  eng: 'en',
  est: 'et',
  fin: 'fi',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  gre: 'el',
  ell: 'el',
  heb: 'he',
  hin: 'hi',
  hrv: 'hr',
  hun: 'hu',
  ind: 'id',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  lav: 'lv',
  lit: 'lt',
  may: 'ms',
  msa: 'ms',
  nor: 'no',
  nob: 'nb',
  per: 'fa',
  fas: 'fa',
  pol: 'pl',
  por: 'pt',
  rum: 'ro',
  ron: 'ro',
  rus: 'ru',
  slo: 'sk',
  slk: 'sk',
  slv: 'sl',
  spa: 'es',
  srp: 'sr',
  swe: 'sv',
  tha: 'th',
  tur: 'tr',
  ukr: 'uk',
  vie: 'vi',
  fil: 'fil',
  tgl: 'tl'
}

export function toBcp47(iso6392: string | undefined): string | undefined {
  return iso6392 ? ISO_639_2[iso6392.toLowerCase()] : undefined
}

/** BCP-47 canônico, ou `undefined` para `und` e tags inválidas. */
export function canonicalTag(tag: string | undefined): string | undefined {
  if (!tag || /^(und|mul|zxx|mis)$/i.test(tag)) return undefined
  try {
    return Intl.getCanonicalLocales(tag)[0]
  } catch {
    return undefined
  }
}
