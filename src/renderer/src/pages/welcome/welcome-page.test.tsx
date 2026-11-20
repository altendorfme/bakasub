// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiKeyStatus, ModelList, PublicSettings } from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { i18n } from '@renderer/i18n'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

const fresh: PublicSettings = {
  ...onboardedSettings,
  'translation.defaultModel': null,
  'translation.defaultTargetLang': null,
  'translation.targetLangs': [],
  'models.favorites': []
}

const catalog: ModelList = {
  fetchedAt: '2026-11-19T00:00:00.000Z',
  offline: false,
  models: [
    {
      id: 'google/gemini-flash',
      name: 'Gemini Flash',
      contextLength: 1_000_000,
      maxCompletionTokens: null,
      isModerated: false,
      pricing: { prompt: 0.0000003, completion: 0.0000025 },
      structuredOutputs: true,
      responseFormat: true
    },
    {
      id: 'meta/llama:free',
      name: 'Llama Free',
      contextLength: 128_000,
      maxCompletionTokens: null,
      isModerated: true,
      pricing: { prompt: 0, completion: 0 },
      structuredOutputs: false,
      responseFormat: true
    }
  ]
}

function setup(initial: { key: boolean; settings: PublicSettings }): {
  setApiKey: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  router: ReturnType<typeof createAppRouter>
} {
  let key: ApiKeyStatus = { present: initial.key, protection: 'os' }
  let settings = initial.settings
  const setApiKey = vi.fn(async (k: string) => {
    if (k === 'bad') return { ok: false as const, error: { code: 'LLM_AUTH', message: 'x' } }
    key = { present: true, protection: 'os' }
    return { ok: true as const, data: key }
  })
  const update = vi.fn(async (patch: Partial<PublicSettings>) => {
    settings = { ...settings, ...patch }
    return { ok: true as const, data: settings }
  })
  installFakeApi({
    jobs: { list: () => ok([]) },
    sidecars: {
      check: () =>
        ok({
          checkedAt: '',
          manifestUpdatedAt: '',
          offline: false,
          installDir: '',
          tools: [],
          ready: true
        })
    },
    settings: {
      apiKeyStatus: () => ok(key),
      get: () => ok(settings),
      setApiKey,
      update,
      tmdbKeyStatus: () => ok({ present: false })
    },
    models: { list: () => ok(catalog) }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/translate'] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { setApiKey, update, router }
}

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

describe('Onboarding', () => {
  it('redirects to /welcome while the key is missing, and opens on the key step', async () => {
    setup({ key: false, settings: fresh })
    expect(
      await screen.findByRole('heading', { name: 'Connect your OpenRouter account' })
    ).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('a rejected key shows why; a valid key unlocks the next step', async () => {
    const { setApiKey } = setup({ key: false, settings: fresh })
    const input = await screen.findByLabelText('OpenRouter API key')
    await userEvent.type(input, 'bad')
    await userEvent.click(screen.getByRole('button', { name: 'Check and save' }))
    expect(await screen.findByText(/OpenRouter rejected the API key/)).toBeTruthy()
    await userEvent.clear(input)
    await userEvent.type(input, 'sk-or-v1-good')
    await userEvent.click(screen.getByRole('button', { name: 'Check and save' }))
    expect(await screen.findByText('Key saved')).toBeTruthy()
    expect(setApiKey).toHaveBeenLastCalledWith('sk-or-v1-good')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(
      await screen.findByRole('heading', { name: 'Pick the models you want to use' })
    ).toBeTruthy()
  })

  it('starring the first model also makes it the default', async () => {
    const { update } = setup({ key: true, settings: fresh })
    const row = await screen.findByText('Gemini Flash')
    expect(screen.getByText(/0.3 in · \$2.5 out per 1M tokens/)).toBeTruthy()
    await userEvent.click(row)
    expect(update).toHaveBeenCalledWith({
      'models.favorites': ['google/gemini-flash'],
      'translation.defaultModel': 'google/gemini-flash'
    })
    expect(await screen.findByText('Default')).toBeTruthy()
  })

  it('finishing goes to Translate once the required steps are done', async () => {
    const { router } = setup({
      key: true,
      settings: {
        ...fresh,
        'models.favorites': ['google/gemini-flash'],
        'translation.defaultModel': 'google/gemini-flash'
      }
    })
    // Opens at the first unfinished required step: languages.
    expect(
      await screen.findByRole('heading', { name: 'Which languages do you translate into?' })
    ).toBeTruthy()
    const list = screen.getByRole('listbox')
    await userEvent.click(within(list).getByText('Brazilian Portuguese'))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Start translating' }))
    expect(await screen.findByRole('button', { name: 'Select several files' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/translate')
  })

  it('the language can be chosen on the first screen, and the setup switches to it', async () => {
    const { update } = setup({ key: false, settings: fresh })
    await userEvent.click(await screen.findByRole('combobox', { name: 'Language' }))
    await userEvent.click(await screen.findByRole('option', { name: /português/i }))
    expect(update).toHaveBeenCalledWith({ 'ui.language': 'pt-BR' })
    expect(
      await screen.findByRole('heading', { name: 'Conecte sua conta do OpenRouter' })
    ).toBeTruthy()
  })
})
