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
    'Idioms become the Brazilian equivalent, not a literal calque (e.g. "sticks out like a sore thumb" → "chama atenção de longe" / "destoa de tudo").'
  ],
  pt: [
    'Follow the 1990 Orthographic Agreement: "deem", "leem", "creem", "voo", "ideia", "heroico", with no "trema" (ü).',
    'Commands use the imperative ("Mira!"/"Mirem!"), never a gerund or a description of the action.'
  ],
  es: [
    'Follow the current RAE spelling rules (e.g. "solo" and "este" without accent).',
    'Commands use the imperative ("¡Apunten!", "¡Dispara!"), never a gerund ("Apuntando…").'
  ],
  de: [
    'Follow the reformed orthography (e.g. "dass", "muss").',
    'Commands use the imperative ("Zielt!", "Gib alles!"), never a participle or a description of the action.'
  ],
  fr: [
    'Commands use the imperative ("Visez !", "Vise !"); keep French spacing before "!", "?", ":", ";".'
  ]
}

export function languageNotes(tag: string): readonly string[] {
  const exact = NOTES[tag]
  if (exact) return exact
  const base = tag.split('-')[0]?.toLowerCase() ?? ''
  return NOTES[base] ?? []
}

/** Tags com notas próprias (para o teste de guarda de `PROMPT_RULES_VERSION`). */
export function languageNoteTags(): readonly string[] {
  return Object.keys(NOTES)
}
