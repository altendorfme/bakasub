import type { GlossaryEntry, TermVariation } from '@shared/ipc-contract'

const same = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/** The glossary has an entry for `term`, with a target or only a rule (case-insensitive). */
export function inGlossary(glossary: readonly GlossaryEntry[], term: string): boolean {
  return glossary.some((e) => same(e.source, term))
}

/**
 * Splits the reported terms by the CURRENT glossary of the preset (not the one of the job, so
 * edits made after the job count):
 * - `suggestions`: terms without an entry, offered for pinning;
 * - `ignored`: terms with an entry that the job's glossary already pinned (`glossaryTarget`) and
 *   the model still varied — a warning only, there is nothing to add.
 * Other terms with an entry (pinned after the job) are dropped.
 */
export function splitByGlossary(
  terms: readonly TermVariation[],
  glossary: readonly GlossaryEntry[]
): { suggestions: TermVariation[]; ignored: TermVariation[] } {
  const suggestions: TermVariation[] = []
  const ignored: TermVariation[] = []
  for (const term of terms)
    if (!inGlossary(glossary, term.term)) suggestions.push(term)
    else if (term.glossaryTarget) ignored.push(term)
  return { suggestions, ignored }
}

/**
 * Appends `term` → `target` for each pin the glossary does not have yet (case-insensitive, also
 * among the pins). Existing entries are never touched: their target and rule stay as they are,
 * even when the preset gained the term after the suggestions were computed.
 */
export function addNewTerms(
  glossary: readonly GlossaryEntry[],
  pins: readonly { term: string; target: string }[]
): GlossaryEntry[] {
  return pins.reduce<GlossaryEntry[]>(
    (g, p) => (inGlossary(g, p.term) ? g : [...g, { source: p.term, target: p.target }]),
    [...glossary]
  )
}

/** `base`, or "base (2)", "base (3)"… avoiding names already taken (case-insensitive). */
export function freePresetName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.trim().toLocaleLowerCase()))
  const name = base.trim().slice(0, 80)
  if (!used.has(name.toLocaleLowerCase())) return name
  for (let i = 2; ; i++) {
    const candidate = `${name.slice(0, 74)} (${i})`
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
  }
}
