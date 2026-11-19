/** Posição (0-based) de cada coluna conhecida no `Format:` de `[Events]`; -1 quando ausente. */
export interface EventFormat {
  readonly count: number
  readonly layer: number
  readonly start: number
  readonly end: number
  readonly style: number
  readonly name: number
  readonly marginL: number
  readonly marginR: number
  readonly marginV: number
  readonly effect: number
  readonly text: number
}

function build(columns: readonly string[]): EventFormat | null {
  const at = (...names: string[]): number => columns.findIndex((c) => names.includes(c))
  const format: EventFormat = {
    count: columns.length,
    layer: at('layer', 'marked'),
    start: at('start'),
    end: at('end'),
    style: at('style'),
    name: at('name', 'actor'),
    marginL: at('marginl'),
    marginR: at('marginr'),
    marginV: at('marginv'),
    effect: at('effect'),
    text: at('text')
  }
  // `Text` precisa ser a última coluna: ele absorve as vírgulas restantes.
  if (format.start < 0 || format.end < 0 || format.text !== columns.length - 1) return null
  return format
}

/** Colunas padrão de ASS v4.00+ e SSA v4.00 (`Marked` ocupa o lugar de `Layer`). */
export const DEFAULT_EVENT_FORMAT: EventFormat = build([
  'layer',
  'start',
  'end',
  'style',
  'name',
  'marginl',
  'marginr',
  'marginv',
  'effect',
  'text'
])!

/** `body` é o que vem depois de "Format:". `null` quando inutilizável (falta Start/End ou Text não é o último). */
export function parseEventFormat(body: string): EventFormat | null {
  return build(body.split(',').map((c) => c.trim().toLowerCase()))
}
