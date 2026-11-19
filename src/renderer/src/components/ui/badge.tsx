import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
  {
    variants: {
      tone: {
        muted: 'bg-muted text-muted-foreground',
        primary: 'bg-primary-soft text-primary',
        violet: 'bg-secondary text-violet',
        warning: 'bg-warning/15 text-warning',
        success: 'bg-success/15 text-success',
        destructive: 'bg-destructive/15 text-destructive'
      }
    },
    defaultVariants: { tone: 'muted' }
  }
)

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
