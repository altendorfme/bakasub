import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { I18nextProvider } from 'react-i18next'
import { useJobEvents } from '@renderer/data/jobs'
import { i18n } from '@renderer/i18n'
import type { AppRouter } from './router'

/** App-wide IPC event subscriptions (once, at the root). */
function EventBridge({ queryClient }: { queryClient: QueryClient }): null {
  useJobEvents(queryClient)
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
        <EventBridge queryClient={queryClient} />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  )
}
