import type { GlossaryEntry } from '@shared/ipc-contract'

const same = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/** The glossary already pins `term` to `target` (case-insensitive). */
export function isPinned(
  glossary: readonly GlossaryEntry[],
  term: string,
  target: string
): boolean {
  return glossary.some(
    (e) => same(e.source, term) && e.target !== undefined && same(e.target, target)
  )
}

/**
 * Pins `term` → `target`: replaces the target of an existing entry for the term (keeping its
 * rule) or appends a new entry. Never duplicates the term.
 */
export function pinTerm(
  glossary: readonly GlossaryEntry[],
  term: string,
  target: string
): GlossaryEntry[] {
  const i = glossary.findIndex((e) => same(e.source, term))
  if (i < 0) return [...glossary, { source: term, target }]
  return glossary.map((e, j) => (j === i ? { ...e, target } : e))
}

/** Pins several terms at once (see `pinTerm`). */
export function pinTerms(
  glossary: readonly GlossaryEntry[],
  pins: readonly { term: string; target: string }[]
): GlossaryEntry[] {
  return pins.reduce<GlossaryEntry[]>((g, p) => pinTerm(g, p.term, p.target), [...glossary])
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
