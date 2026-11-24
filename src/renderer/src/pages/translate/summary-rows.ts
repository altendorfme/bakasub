export interface SummaryRow<S extends string> {
  step: S
  label: string
  /** `null` = not decided yet: the row is left out (never a placeholder). */
  value: string | null
  warn?: string
  detail?: string
}

/** Rows of a reached step (index ≤ `furthest`) that have a value. */
export function visibleRows<S extends string>(
  rows: readonly SummaryRow<S>[],
  steps: readonly S[],
  furthest: number
): (SummaryRow<S> & { value: string })[] {
  return rows.filter((r): r is SummaryRow<S> & { value: string } => {
    const i = steps.indexOf(r.step)
    return i !== -1 && i <= furthest && r.value !== null
  })
}
