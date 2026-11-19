import type { QueryClient } from '@tanstack/react-query'
import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory
} from '@tanstack/react-router'
import { AppShell } from '@renderer/components/layout/app-shell'
import { PlaceholderPage } from '@renderer/pages/placeholder-page'
import { PAGES } from './pages'

export interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: AppShell })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/translate' })
  }
})

const pageRoutes = PAGES.map((page) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/${page}`,
    component: () => <PlaceholderPage page={page} />
  })
)

const routeTree = rootRoute.addChildren([indexRoute, ...pageRoutes])

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
