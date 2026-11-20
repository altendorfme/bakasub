import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { reportError } from '@renderer/lib/report-error'
import { i18n } from '@renderer/i18n'

interface State {
  error: Error | null
}

/**
 * Catches render errors of a subtree (one per page, so the shell stays usable), logs them in the
 * Main (`source: 'boundary'`) and offers to retry. `resetKey` (e.g. the route) clears the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const withStack = new Error(error.message)
    withStack.stack = `${error.stack ?? ''}\n\nComponent stack:${info.componentStack ?? ''}`
    void reportError(withStack, 'boundary')
  }

  componentDidUpdate(prev: { resetKey?: unknown }): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    // `i18n.t` directly: hooks are not allowed in a class, and the provider may be what broke.
    const t = i18n.t.bind(i18n)
    return (
      <div role="alert" className="mx-auto mt-16 grid max-w-md gap-3 text-center">
        <AlertTriangle className="mx-auto size-8 text-warning" />
        <h2 className="text-base font-semibold">{t('common:boundary.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('common:boundary.body')}</p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => this.setState({ error: null })}>
            {t('common:actions.retry')}
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            {t('common:actions.reload')}
          </Button>
        </div>
      </div>
    )
  }
}
