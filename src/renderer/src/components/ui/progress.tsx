import * as ProgressPrimitive from '@radix-ui/react-progress'
import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'

export function Progress({
  value,
  className,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root>): React.JSX.Element {
  return (
    <ProgressPrimitive.Root
      value={value}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-linear-to-r from-primary to-violet transition-[width]"
        style={{ width: `${value ?? 0}%` }}
      />
    </ProgressPrimitive.Root>
  )
}
