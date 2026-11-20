import * as LabelPrimitive from '@radix-ui/react-label'
import { useId, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { cloneElement } from 'react'
import { cn } from '@renderer/lib/utils'
import { HelpTip } from './help-tip'

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>): React.JSX.Element {
  return <LabelPrimitive.Root className={cn('text-sm font-medium', className)} {...props} />
}

/**
 * Label + control + hint/error, wired for screen readers (`aria-describedby`, `aria-invalid`).
 * The child must be a single control that accepts `id`.
 */
export function Field({
  label,
  hint,
  error,
  help,
  className,
  children
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Longer explanation behind a "?" (`HelpTip`). */
  help?: ReactNode
  className?: string
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
}): React.JSX.Element {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    // content-start: when a neighbour in the same row is taller (longer hint, an error), the
    // rows must not stretch, or label and control drift down.
    <div className={cn('grid content-start gap-1.5', className)}>
      <span className="flex items-center gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        {help ? <HelpTip>{help}</HelpTip> : null}
      </span>
      {cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined
      })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
