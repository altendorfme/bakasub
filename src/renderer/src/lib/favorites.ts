/**
 * A list with a default that must belong to it (favorite models, target languages). Same rule
 * as the Main's `PreferencesService`, applied before sending so the patch never conflicts.
 */
export interface ListWithDefault {
  readonly list: readonly string[]
  readonly default: string | null
}

/** Adding the first item makes it the default; removing the default promotes the next one. */
export function toggleItem(s: ListWithDefault, item: string): ListWithDefault {
  if (!s.list.includes(item)) return { list: [...s.list, item], default: s.default ?? item }
  const list = s.list.filter((x) => x !== item)
  return { list, default: s.default === item ? (list[0] ?? null) : s.default }
}

export function makeDefault(s: ListWithDefault, item: string): ListWithDefault {
  return { list: s.list.includes(item) ? s.list : [...s.list, item], default: item }
}

/** USD per token -> "0.15" per 1M tokens (2 significant decimals for small prices). */
export function pricePerMillion(perToken: number): string {
  const v = perToken * 1_000_000
  if (v === 0) return '0'
  if (v >= 10) return v.toFixed(0)
  if (v >= 1) return v.toFixed(2).replace(/\.?0+$/, '')
  return v.toPrecision(2).replace(/\.?0+$/, '')
}
