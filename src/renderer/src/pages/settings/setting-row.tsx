import { useState, type ReactNode } from 'react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { inputClass } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'

/** Label + description on the left, the control on the right; stacks on narrow windows. */
export function SettingRow({
  label,
  description,
  htmlFor,
  children
}: {
  label: ReactNode
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
      <div className="grid gap-0.5">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {description ? (
          <p className="max-w-[60ch] text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="sm:justify-self-end">{children}</div>
    </div>
  )
}

/**
 * Integer (or decimal) field that saves on blur/Enter, only when valid. `nullable` adds an
 * empty state ("no limit"): clearing the field saves `null`.
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
      description={
        <>
          {description}
          {invalid ? (
            <span className="block text-destructive">{t('settings.range', { min, max })}</span>
          ) : null}
        </>
      }
    >
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
          className={cn(inputClass, 'w-28 text-right tabular-nums')}
        />
        {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
      </span>
    </SettingRow>
  )
}
