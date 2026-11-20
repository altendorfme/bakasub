import { Outlet, useRouterState } from '@tanstack/react-router'
import { ErrorBoundary } from '@renderer/components/common/error-boundary'
import { Sidebar } from './sidebar'
import { StatusBar } from './status-bar'

export function AppShell(): React.JSX.Element {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-auto">
          {/* Per page: a broken screen keeps the sidebar and status bar usable. */}
          <ErrorBoundary resetKey={path}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
