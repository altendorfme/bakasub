/**
 * Notas de escrita por idioma-alvo, anexadas às regras fixas do System Prompt.
 * Regras genéricas (idioms, imperativo, ortografia vigente) valem para qualquer idioma;
 * aqui ficam só os exemplos concretos que ancoram o modelo naquele idioma.
 * Chave: tag BCP 47 completa (`pt-BR`) com fallback para o idioma base (`pt`).
 * Texto em inglês, como o resto do prompt.
 */
const NOTES: Readonly<Record<string, readonly string[]>> = {
  'pt-BR': [
    'Use natural Brazilian Portuguese; avoid European Portuguese forms (e.g. "você", not "tu"; "ônibus", not "autocarro").',
    'Follow the 1990 Orthographic Agreement: "deem", "leem", "creem", "voo", "ideia", "heroico", "para" (verb), with no "trema" (ü).',
    'Commands use the imperative ("Mire!"/"Mirem!", "Deem tudo de si!"), never a gerund ("Mirando…") or a description of the action.',
    'Idioms become the Brazilian equivalent, not a literal calque (e.g. "sticks out like a sore thumb" → "chama atenção de longe" / "destoa de tudo").',
    'Gender: "I\'m tired" from a woman → "Estou cansada"; speaker unknown → "Que cansaço!". "You\'re late" with an unknown listener → "Você se atrasou", not a guessed "atrasado"/"atrasada".'
  ],
  pt: [
    'Follow the 1990 Orthographic Agreement: "deem", "leem", "creem", "voo", "ideia", "heroico", with no "trema" (ü).',
    'Commands use the imperative ("Mira!"/"Mirem!"), never a gerund or a description of the action.'
  ],
  es: [
    'Follow the current RAE spelling rules (e.g. "solo" and "este" without accent).',
    'Commands use the imperative ("¡Apunten!", "¡Dispara!"), never a gerund ("Apuntando…").',
    'Gender: "I\'m ready" from a woman → "Estoy lista"; speaker unknown → "Ya estoy"; "Are you sure?" with an unknown listener → "¿Lo tienes claro?", not a guessed "seguro"/"segura".'
  ],
  de: [
    'Follow the reformed orthography (e.g. "dass", "muss").',
    'Commands use the imperative ("Zielt!", "Gib alles!"), never a participle or a description of the action.'
  ],
  fr: [
    'Commands use the imperative ("Visez !", "Vise !"); keep French spacing before "!", "?", ":", ";".'
  ]
}

/**
 * Idiomas-base com concordância de gênero em adjetivos, particípios ou verbos (o gênero de quem
 * fala/ouve aparece na frase). Recebem a regra de gênero do System Prompt. Idiomas sem essa
 * flexão (en, ja, zh, ko, tr, fi, hu, id…) não: a regra só gastaria tokens.
 */
const GENDER_AGREEMENT: ReadonlySet<string> = new Set([
  'pt',
  'es',
  'ca',
  'gl',
  'fr',
  'it',
  'ro',
  'de',
  'ru',
  'uk',
  'be',
  'pl',
  'cs',
  'sk',
  'hr',
  'sr',
  'bs',
  'sl',
  'bg',
  'mk',
  'lt',
  'lv',
  'el',
  'he',
  'ar',
  'hi',
  'ur'
])

function baseLang(tag: string): string {
  return tag.split('-')[0]?.toLowerCase() ?? ''
}

export function hasGenderAgreement(tag: string): boolean {
  return GENDER_AGREEMENT.has(baseLang(tag))
}

export function languageNotes(tag: string): readonly string[] {
  const exact = NOTES[tag]
  if (exact) return exact
  return NOTES[baseLang(tag)] ?? []
}

/**
 * Tags cujo texto fixo difere do genérico: com notas próprias ou com a regra de gênero
 * (para o teste de guarda de `PROMPT_RULES_VERSION`).
 */
export function languageNoteTags(): readonly string[] {
  return [...new Set([...Object.keys(NOTES), ...GENDER_AGREEMENT])]
}
