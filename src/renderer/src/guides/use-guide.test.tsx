// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '../i18n'
import { useGuide } from './use-guide'

const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('useGuide', () => {
  it('follows the app language and switches with it', async () => {
    const { result } = renderHook(() => useGuide('openrouter-limits'), { wrapper })
    expect(result.current.lang).toBe('en')
    await act(() => i18n.changeLanguage('pt-BR'))
    expect(result.current.lang).toBe('pt-BR')
    expect(result.current.markdown).toContain('# Limites, esperas e novas tentativas')
  })
})
