import { Suspense } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory
} from '@tanstack/react-router'
import { AppShell } from '@renderer/components/layout/app-shell'
import { apiKeyStatusQuery, isOnboarded, settingsQuery } from '@renderer/data/settings'
import { PlaceholderPage } from '@renderer/pages/placeholder-page'
import { PAGES } from './pages'
import { SCREENS, WelcomeScreen } from './screens'

export interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet })

/** Loads what the onboarding decision needs; an IPC failure never locks the user out. */
async function onboarded(qc: QueryClient): Promise<boolean> {
  try {
    const [key, settings] = await Promise.all([
      qc.ensureQueryData(apiKeyStatusQuery),
      qc.ensureQueryData(settingsQuery)
    ])
    return isOnboarded(key, settings)
  } catch {
    return true
  }
}

/** Everything with the sidebar. Until the key, default model and language exist: `/welcome`. */
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: AppShell,
  beforeLoad: async ({ context }) => {
    if (!(await onboarded(context.queryClient))) throw redirect({ to: '/welcome' })
  }
})

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  component: () => (
    <Suspense fallback={null}>
      <WelcomeScreen />
    </Suspense>
  ),
  loader: ({ context }) => onboarded(context.queryClient)
})

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/translate' })
  }
})

const pageRoutes = PAGES.map((page) =>
  createRoute({
    getParentRoute: () => shellRoute,
    path: `/${page}`,
    // Only the queue has a search param (`?job=` selects a job); the rest ignore it.
    validateSearch: (search: Record<string, unknown>): { job?: string } =>
      typeof search.job === 'string' ? { job: search.job } : {},
    component: (): React.JSX.Element => {
      const Screen = SCREENS[page]
      return Screen ? (
        <Suspense fallback={null}>
          <Screen />
        </Suspense>
      ) : (
        <PlaceholderPage page={page} />
      )
    }
  })
)

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([indexRoute, ...pageRoutes]),
  welcomeRoute
])

/**
 * Hash history in the app: in production the renderer loads from `file://`, where path-based
 * history has nothing to resolve against. Tests pass a memory history.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the inferred router type is what `Register` needs
export function createAppRouter(opts: { queryClient: QueryClient; history?: RouterHistory }) {
  return createRouter({
    routeTree,
    context: { queryClient: opts.queryClient },
    history: opts.history ?? createHashHistory(),
    defaultPreload: false
  })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
