/**
 * Shape of a translation: same keys as the English source, every leaf a string. A missing or
 * extra key in another locale is a compile error.
 */
export type LocaleShape<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : LocaleShape<T[K]>
}
