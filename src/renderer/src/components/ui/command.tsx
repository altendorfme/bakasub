import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'

/** Searchable list (cmdk): the body of comboboxes such as the model and language pickers. */
export function Command({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive>): React.JSX.Element {
  return <CommandPrimitive className={cn('flex flex-col', className)} {...props} />
}

export function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b px-2.5">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        className={cn(
          'h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70',
          className
        )}
        {...props}
      />
    </div>
  )
}

export function CommandList({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.List>): React.JSX.Element {
  return (
    <CommandPrimitive.List className={cn('max-h-72 overflow-y-auto p-1', className)} {...props} />
  )
}

export const CommandEmpty = ({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>): React.JSX.Element => (
  <CommandPrimitive.Empty
    className={cn('px-2 py-6 text-center text-sm text-muted-foreground', className)}
    {...props}
  />
)

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>): React.JSX.Element {
  return (
    <CommandPrimitive.Group
      className={cn(
        '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export function CommandItem({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item>): React.JSX.Element {
  return (
    <CommandPrimitive.Item
      className={cn(
        'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent',
        className
      )}
      {...props}
    />
  )
}
