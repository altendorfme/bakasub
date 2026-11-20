import { TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { inputClass } from '@renderer/components/ui/input'
import { HelpTip } from '@renderer/components/ui/help-tip'
import { cn } from '@renderer/lib/utils'

/** Label + description on the left, the control on the right; stacks on narrow windows. */
export function SettingRow({
  label,
  description,
  htmlFor,
  help,
  children
}: {
  label: ReactNode
  description?: ReactNode
  htmlFor?: string
  help?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
      <div className="grid gap-0.5">
        <span className="flex items-center gap-1.5">
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </label>
          {help ? <HelpTip>{help}</HelpTip> : null}
        </span>
        {description ? (
          <p className="max-w-[60ch] text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="sm:justify-self-end">{children}</div>
    </div>
  )
}

/** Faixa recomendada dentro dos limites aceitos, com o aviso de cada lado. */
export interface Recommended {
  readonly min: number
  readonly max: number
  /** Consequência de ficar abaixo / acima. */
  readonly low: string
  readonly high: string
}

/**
 * Integer (or decimal) field that saves on blur/Enter, only when valid. `nullable` adds an
 * empty state ("no limit"): clearing the field saves `null`. `recommended` draws the accepted
 * range with the recommended band and warns (without blocking) when the value leaves it.
 */
export function NumberSetting({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  unit,
  nullable = false,
  emptyLabel,
  inputClassName = 'w-28',
  help,
  recommended,
  onSave
}: {
  label: ReactNode
  description?: ReactNode
  value: number | null | undefined
  min: number
  max: number
  step?: number
  unit?: string
  nullable?: boolean
  emptyLabel?: string
  /** Width of the field (wider when the placeholder is a phrase). */
  inputClassName?: string
  help?: ReactNode
  recommended?: Recommended
  onSave: (v: number | null) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null || value === undefined ? '' : String(value))
  const parsed = shown.trim() === '' ? null : Number(shown)
  const invalid =
    (parsed === null && !nullable) ||
    (parsed !== null &&
      (!Number.isFinite(parsed) ||
        parsed < min ||
        parsed > max ||
        (step >= 1 && !Number.isInteger(parsed))))

  const current = invalid ? value : parsed
  const warning =
    recommended && typeof current === 'number'
      ? current < recommended.min
        ? recommended.low
        : current > recommended.max
          ? recommended.high
          : null
      : null

  const commit = (): void => {
    // Invalid: keep the text and the message, so the user sees what to fix.
    if (draft === null || invalid) return
    if (parsed !== value) onSave(parsed)
    setDraft(null)
  }

  return (
    <SettingRow
      label={label}
      htmlFor={id}
      help={help}
      description={
        <>
          {description}
          {recommended ? (
            <span className="block">
              {t('settings.advanced.recommended', { min: recommended.min, max: recommended.max })}
            </span>
          ) : null}
          {invalid ? (
            <span className="block text-destructive">{t('settings.range', { min, max })}</span>
          ) : warning ? (
            <span role="status" className="mt-0.5 flex items-start gap-1 text-warning">
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {warning}
            </span>
          ) : null}
        </>
      }
    >
      <span className="grid justify-items-end gap-1.5">
        <span className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={shown}
            placeholder={emptyLabel}
            aria-invalid={invalid || undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className={cn(inputClass, inputClassName, 'text-right tabular-nums')}
          />
          {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
        </span>
        {recommended ? (
          <RangeTrack
            min={min}
            max={max}
            band={recommended}
            value={typeof current === 'number' ? current : null}
            off={warning !== null}
            className={inputClassName}
          />
        ) : null}
      </span>
    </SettingRow>
  )
}

/**
 * Régua dos limites aceitos: faixa recomendada destacada e um marcador no valor. Decorativa (o
 * texto ao lado diz o mesmo); o marcador muda de cor fora da faixa.
 */
function RangeTrack({
  min,
  max,
  band,
  value,
  off,
  className
}: {
  min: number
  max: number
  band: { min: number; max: number }
  value: number | null
  off: boolean
  className?: string
}): React.JSX.Element {
  const at = (v: number): string =>
    `${((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100}%`
  return (
    <span aria-hidden data-testid="range-track" className={cn('relative block h-1.5', className)}>
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
      <span
        className="absolute inset-y-0 rounded-full bg-success/35"
        style={{ left: at(band.min), width: `calc(${at(band.max)} - ${at(band.min)})` }}
      />
      {value !== null ? (
        <span
          data-off={off || undefined}
          className={cn(
            'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card',
            off ? 'bg-warning' : 'bg-success'
          )}
          style={{ left: at(value) }}
        />
      ) : null}
    </span>
  )
}
