import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { I18nextProvider } from 'react-i18next'
import { useJobEvents } from '@renderer/data/jobs'
import { i18n } from '@renderer/i18n'
import { useLanguageSync } from '@renderer/i18n/use-language-sync'
import { ErrorBoundary } from '@renderer/components/common/error-boundary'
import { TooltipProvider } from '@renderer/components/ui/popover'
import { Toaster } from '@renderer/components/ui/toaster'
import type { AppRouter } from './router'

/** App-wide IPC event subscriptions (once, at the root). */
function EventBridge({ queryClient }: { queryClient: QueryClient }): null {
  useJobEvents(queryClient)
  useLanguageSync()
  return null
}

export function App({
  queryClient,
  router
}: {
  queryClient: QueryClient
  router: AppRouter
}): React.JSX.Element {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <EventBridge queryClient={queryClient} />
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  )
}
