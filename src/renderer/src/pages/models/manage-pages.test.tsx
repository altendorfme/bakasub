// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelList, PublicSettings } from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

const catalog: ModelList = {
  fetchedAt: '2026-11-19T00:00:00.000Z',
  offline: false,
  models: [
    {
      id: 'a/b',
      name: 'Model AB',
      contextLength: 200_000,
      maxCompletionTokens: null,
      isModerated: false,
      pricing: { prompt: 1e-6, completion: 2e-6 },
      structuredOutputs: true,
      responseFormat: true
    }
  ]
}

function setup(
  path: string,
  settings: PublicSettings
): {
  update: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
} {
  let s = settings
  const update = vi.fn(async (patch: Partial<PublicSettings>) => {
    s = { ...s, ...patch }
    return { ok: true as const, data: s }
  })
  const list = vi.fn(async () => ({ ok: true as const, data: catalog }))
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
      apiKeyStatus: () => ok({ present: true, protection: 'os' as const }),
      get: () => ok(s),
      update
    },
    models: {
      list,
      freeQuota: () =>
        ok({
          tier: 'under-10' as const,
          source: 'auto' as const,
          limit: 50,
          used: 8,
          remaining: 42
        })
    }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { update, list }
}

afterEach(cleanup)

describe('Models', () => {
  it('flags favorites that left the catalog and lets the user remove them', async () => {
    const { update } = setup('/models', {
      ...onboardedSettings,
      'models.favorites': ['a/b', 'gone/model'],
      'translation.defaultModel': 'gone/model'
    })
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('gone/model')).toBeTruthy()
    await userEvent.click(within(alert).getByRole('button', { name: 'Remove' }))
    // The removed one was the default: the next favorite takes over.
    expect(update).toHaveBeenCalledWith({
      'models.favorites': ['a/b'],
      'translation.defaultModel': 'a/b'
    })
  })

  it('refresh bypasses the cache; the quota is shown', async () => {
    const { list } = setup('/models', onboardedSettings)
    expect(await screen.findByText('42 of 50 free-model requests left today')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh list' }))
    expect(list).toHaveBeenLastCalledWith(true)
  })
})

describe('Languages', () => {
  it('adding a language keeps the default', async () => {
    const { update } = setup('/languages', onboardedSettings)
    await userEvent.click(await screen.findByText('Spanish'))
    expect(update).toHaveBeenCalledWith({
      'translation.targetLangs': ['pt-BR', 'es'],
      'translation.defaultTargetLang': 'pt-BR'
    })
  })
})
