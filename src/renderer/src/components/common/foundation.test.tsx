// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@renderer/i18n'
import { useCountdown } from '@renderer/lib/use-countdown'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { ErrorBoundary } from './error-boundary'
import { GuideView } from './guide-view'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Boom(): React.JSX.Element {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  it('shows a fallback and reports the error to the Main log', async () => {
    const report = vi.fn(() => ok({ accepted: true }))
    installFakeApi({ logs: { report } })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong')
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'kaboom', source: 'boundary' })
    )
  })
})

describe('GuideView', () => {
  it('guide links navigate in-app; other links open in the browser', async () => {
    const openExternal = vi.fn(() => ok({ opened: true as const }))
    installFakeApi({ app: { openExternal } })
    const onNavigate = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <GuideView id="openrouter-key" onNavigate={onNavigate} />
      </I18nextProvider>
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Getting an OpenRouter key'
    )
    await userEvent.click(screen.getByRole('link', { name: /Limits, waits and retries/ }))
    expect(onNavigate).toHaveBeenCalledWith('openrouter-limits')
    await userEvent.click(screen.getByRole('link', { name: /openrouter.ai\/settings\/keys/ }))
    expect(openExternal).toHaveBeenCalledWith('https://openrouter.ai/settings/keys')
  })

  it('follows the app language', async () => {
    installFakeApi()
    await act(() => i18n.changeLanguage('pt-BR'))
    render(
      <I18nextProvider i18n={i18n}>
        <GuideView id="tmdb-key" />
      </I18nextProvider>
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Como conseguir uma key do TMDB'
    )
    await act(() => i18n.changeLanguage('en'))
  })
})

describe('GuideView tables', () => {
  it('renders GFM tables (the limits guide has one)', () => {
    installFakeApi()
    render(
      <I18nextProvider i18n={i18n}>
        <GuideView id="openrouter-limits" />
      </I18nextProvider>
    )
    const table = screen.getByRole('table')
    expect(table.querySelectorAll('tbody tr').length).toBe(7)
  })
})

describe('useCountdown', () => {
  it('ticks down to zero', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { result } = renderHook(() => useCountdown(3000))
    expect(result.current).toBe(3)
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current).toBe(1)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(0)
  })
})
