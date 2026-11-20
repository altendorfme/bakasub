import { Fragment } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'

/**
 * Steps in a row with arrows between them. Done steps show a check; any step the user can
 * reach (see `canGo`) is a button.
 */
export function StepBar<S extends string>({
  steps,
  current,
  label,
  done,
  reachable,
  onGo
}: {
  steps: readonly S[]
  current: S
  label: (s: S) => string
  done: (s: S) => boolean
  reachable: (s: S) => boolean
  onGo: (s: S) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <ol
      aria-label={t('translate.stepsLabel')}
      className="flex flex-wrap items-center justify-center gap-1.5"
    >
      {steps.map((s, i) => {
        const active = s === current
        const ok = !active && done(s)
        return (
          <Fragment key={s}>
            {i > 0 ? (
              <li aria-hidden className="text-muted-foreground/60">
                <ChevronRight className="size-4" />
              </li>
            ) : null}
            <li>
              <button
                type="button"
                disabled={!reachable(s)}
                aria-current={active ? 'step' : undefined}
                onClick={() => onGo(s)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors disabled:cursor-default disabled:opacity-40',
                  active
                    ? 'bg-primary-soft font-medium text-primary ring-1 ring-primary/40'
                    : ok
                      ? 'text-foreground hover:bg-accent'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'grid size-5 place-items-center rounded-full border text-[11px]',
                    active
                      ? 'border-primary'
                      : ok
                        ? 'border-success bg-success/15 text-success'
                        : 'border-current'
                  )}
                >
                  {ok ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                {label(s)}
              </button>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
