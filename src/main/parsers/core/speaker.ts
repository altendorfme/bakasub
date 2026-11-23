/**
 * Falante de um cue a partir de `Cue.actor` (coluna `Name` do ASS/SSA, `<v Nome>` do VTT).
 *
 * Fonte única do que conta como falante "de verdade": usada pelo prompt (`speaker="…"`) e pelo
 * hash da Job Memory. Valores genéricos que fansubs e editores deixam na coluna não identificam
 * personagem e são descartados.
 */

/**
 * Comparados sem caixa, após `trim` e colapso de espaços. Tratados como "sem ator": não vão ao
 * prompt nem ao context hash. Alterar a lista muda hashes: suba `CONTEXT_HASH_VERSION`.
 */
const GENERIC_ACTORS: ReadonlySet<string> = new Set([
  'default',
  'ntp',
  'main',
  'top',
  'bottom',
  'italic',
  'italics',
  'sign',
  'signs',
  'song',
  'songs',
  'lyrics',
  'op',
  'ed',
  'insert',
  'karaoke',
  'kara',
  'title',
  'caption',
  'note',
  'notes',
  'tl note',
  'tn',
  'text',
  'actor',
  'name',
  'comment',
  'none',
  'unknown',
  'alt',
  'overlap',
  'flashback'
])

/** NFC, controles (incl. `\0`, separador do hash) viram espaço, espaços colapsados, trim. Caixa preservada. */
function normalize(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .trim()
}

/** `true` quando o valor não identifica um personagem (vazio, genérico ou só pontuação/dígitos). */
export function isGenericActor(actor: string | undefined): boolean {
  if (actor === undefined) return true
  const n = normalize(actor)
  if (!/\p{L}/u.test(n)) return true
  return GENERIC_ACTORS.has(n.toLowerCase())
}

/** Nome do falante normalizado (NFC, espaços colapsados, caixa preservada), ou `undefined` se ausente/genérico. */
export function speakerOf(actor: string | undefined): string | undefined {
  return isGenericActor(actor) ? undefined : normalize(actor!)
}
