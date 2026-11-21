import { useEffect } from 'react'
import type { NavigationTarget } from '@shared/ipc-contract'
import type { AppRouter } from './router'

/** Where each notification target lands (the Main already showed and focused the window). */
export function navigateTo(router: Pick<AppRouter, 'navigate'>, target: NavigationTarget): void {
  switch (target.kind) {
    case 'job':
      void router.navigate({ to: '/queue', search: { job: target.id } })
      return
    case 'batch':
      void router.navigate({ to: '/translate', search: { batch: target.id } })
      return
    case 'settings':
      void router.navigate({ to: '/settings', search: { tab: target.tab } })
  }
}

/** Subscribes once (app root) to `app:navigate`: a click on a native notification. */
export function useNavigationEvents(router: Pick<AppRouter, 'navigate'>): void {
  useEffect(() => window.api.events.on('app:navigate', (t) => navigateTo(router, t)), [router])
}
