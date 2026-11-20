import type { ModelSummary } from '@shared/ipc-contract'

export type ModelSort = 'catalog' | 'price-asc' | 'price-desc' | 'context-desc'

export interface ModelListOptions {
  sort: ModelSort
  /** Provider prefix of the id (`google`, `anthropic`…); `null` = all. */
  family: string | null
  freeOnly: boolean
  jsonOnly: boolean
  /** Hide models whose provider moderates content. */
  hideModerated: boolean
  favoritesOnly: boolean
  /**
   * Price range in USD per 1M tokens, applied to both the input and the output price.
   * `null` = no bound. Any bound hides models with a dynamic price.
   */
  priceMin: number | null
  priceMax: number | null
}

export const defaultModelListOptions: ModelListOptions = {
  sort: 'catalog',
  family: null,
  freeOnly: false,
  jsonOnly: false,
  hideModerated: false,
  favoritesOnly: false,
  priceMin: null,
  priceMax: null
}

export const familyOf = (id: string): string => id.split('/')[0] ?? id

const isFree = (m: ModelSummary): boolean =>
  m.id.endsWith(':free') ||
  (m.pricing !== null && m.pricing.prompt === 0 && m.pricing.completion === 0)

/** Typical subtitle job: output about the size of the input, so both prices count equally. */
const price = (m: ModelSummary): number | null =>
  m.pricing ? m.pricing.prompt + m.pricing.completion : null

/** Families present in the catalog, sorted by name. */
export const families = (models: readonly ModelSummary[]): string[] =>
  [...new Set(models.map((m) => familyOf(m.id)))].sort()

/**
 * Filter and sort for the model picker. Favorites always come first (in the chosen order);
 * models with a dynamic price (`null`) go last when sorting by price.
 */
export function filterAndSortModels(
  models: readonly ModelSummary[],
  o: ModelListOptions,
  favorites: readonly string[]
): ModelSummary[] {
  const fav = new Set(favorites)
  const shown = models.filter(
    (m) =>
      (!o.favoritesOnly || fav.has(m.id)) &&
      (o.family === null || familyOf(m.id) === o.family) &&
      (!o.freeOnly || isFree(m)) &&
      (!o.jsonOnly || m.structuredOutputs) &&
      (!o.hideModerated || !m.isModerated) &&
      inPriceRange(m, o.priceMin, o.priceMax)
  )
  const byPrice =
    (dir: 1 | -1) =>
    (a: ModelSummary, b: ModelSummary): number => {
      const pa = price(a)
      const pb = price(b)
      if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1
      return (pa - pb) * dir
    }
  const sorted =
    o.sort === 'price-asc'
      ? [...shown].sort(byPrice(1))
      : o.sort === 'price-desc'
        ? [...shown].sort(byPrice(-1))
        : o.sort === 'context-desc'
          ? [...shown].sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0))
          : shown
  return [...sorted.filter((m) => fav.has(m.id)), ...sorted.filter((m) => !fav.has(m.id))]
}

/** USD per 1M tokens. */
const perMillion = (perToken: number): number => perToken * 1_000_000

/** Both the input and the output price inside [min, max] (per 1M tokens). */
export function inPriceRange(m: ModelSummary, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true
  if (!m.pricing) return false
  return [perMillion(m.pricing.prompt), perMillion(m.pricing.completion)].every(
    (p) => (min === null || p >= min - 1e-9) && (max === null || p <= max + 1e-9)
  )
}

/** "Nice" stops for the price slider (USD per 1M), up to the most expensive model. */
const NICE = [0, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 25, 50, 75, 100, 150, 250, 500]

export function priceStops(models: readonly ModelSummary[]): number[] {
  const top = Math.max(
    0,
    ...models.flatMap((m) =>
      m.pricing ? [perMillion(m.pricing.prompt), perMillion(m.pricing.completion)] : []
    )
  )
  const i = NICE.findIndex((v) => v >= top)
  return i === -1 ? [...NICE, Math.ceil(top)] : NICE.slice(0, Math.max(i, 1) + 1)
}
