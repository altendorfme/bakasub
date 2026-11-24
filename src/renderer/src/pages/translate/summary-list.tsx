import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { visibleRows, type SummaryRow } from './summary-rows'

/**
 * The wizard summary: one row per choice already made, linking back to its step. A row shows
 * once its step was reached (`furthest`) and its value exists, so the list grows with the
 * wizard and never lists a default the user has not seen yet.
 */
export function SummaryList<S extends string>({
  id,
  title,
  empty,
  rows,
  steps,
  furthest,
  current,
  stepLabel,
  canGo,
  onGo
}: {
  id: string
  title: string
  /** Shown while no row qualifies. */
  empty: string
  rows: readonly SummaryRow<S>[]
  steps: readonly S[]
  furthest: number
  current: S
  stepLabel: (s: S) => string
  canGo: (s: S) => boolean
  onGo: (s: S) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const shown = visibleRows(rows, steps, furthest)

  return (
    <aside
      aria-labelledby={id}
      className="grid grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-xl border bg-card/92 p-4 lg:sticky lg:top-6"
    >
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      {shown.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {shown.map((r) => {
            const go = canGo(r.step)
            return (
              <li key={r.label}>
                <button
                  type="button"
                  disabled={!go}
                  onClick={() => onGo(r.step)}
                  aria-label={`${r.label}: ${r.value}. ${t('translate.summary.edit', { step: stepLabel(r.step) })}`}
                  className={cn(
                    'grid w-full gap-0.5 rounded-md px-2 py-1.5 text-left disabled:cursor-default',
                    go && 'hover:bg-accent',
                    current === r.step && 'bg-accent/60'
                  )}
                >
                  <span className="text-[11px] text-muted-foreground">{r.label}</span>
                  <span className="truncate text-sm" title={r.value}>
                    {r.value}
                  </span>
                  {r.detail ? (
                    <span className="truncate text-xs text-muted-foreground" title={r.detail}>
                      {r.detail}
                    </span>
                  ) : null}
                  {r.warn ? (
                    <span className="flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {r.warn}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
