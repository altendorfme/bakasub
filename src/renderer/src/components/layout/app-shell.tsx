import { Outlet } from '@tanstack/react-router'
import { Sidebar } from './sidebar'
import { StatusBar } from './status-bar'

export function AppShell(): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
