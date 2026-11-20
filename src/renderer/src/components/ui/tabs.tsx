import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'

export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>): React.JSX.Element {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex items-center gap-1 border-b', className)}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>): React.JSX.Element {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground',
        className
      )}
      {...props}
    />
  )
}

/** `value` 0..1; `undefined` = indeterminate. */
export function Progress({
  value,
  className,
  ...props
}: Omit<ComponentProps<typeof ProgressPrimitive.Root>, 'value'> & {
  value?: number
}): React.JSX.Element {
  const pct = value === undefined ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <ProgressPrimitive.Root
      value={pct ?? null}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          'h-full rounded-full bg-linear-to-r from-primary to-violet transition-[width]',
          pct === undefined && 'w-1/3 animate-pulse'
        )}
        style={pct === undefined ? undefined : { width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  )
}
