import { Toaster as Sonner } from 'sonner'

/** One per app (root). Show toasts with `toast` from `sonner`. */
export function Toaster(): React.JSX.Element {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      offset={{ bottom: 40 }}
      toastOptions={{
        classNames: {
          toast: '!bg-popover !text-popover-foreground !border-border',
          description: '!text-muted-foreground'
        }
      }}
    />
  )
}
