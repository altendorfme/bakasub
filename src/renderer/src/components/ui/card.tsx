import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'

/** Semi-opaque so the media artwork backdrop shows through slightly, never fully transparent. */
export function Card({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card/92 text-card-foreground backdrop-blur-md',
        className
      )}
      {...props}
    />
  )
}
