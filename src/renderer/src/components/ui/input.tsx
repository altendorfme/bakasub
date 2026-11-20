import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'

export const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background/60 px-3 text-sm placeholder:text-muted-foreground/70 disabled:opacity-50 aria-invalid:border-destructive'

export function Input({ className, ...props }: ComponentProps<'input'>): React.JSX.Element {
  return <input className={cn(inputClass, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>): React.JSX.Element {
  return (
    <textarea
      className={cn(inputClass, 'h-auto min-h-20 resize-y py-2 leading-relaxed', className)}
      {...props}
    />
  )
}
