// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Preset, PresetInput } from '@shared/ipc-contract'
import { App } from '@renderer/app/app'
import { createAppRouter } from '@renderer/app/router'
import { installFakeApi, ok } from '@renderer/test/fake-api'
import { onboardedSettings } from '@renderer/test/fixtures'

const series: Preset = {
  id: 'builtin:series',
  builtin: true,
  name: 'Series',
  mediaType: 'series',
  temperature: 0.45,
  prompt: 'Natural dialogue.',
  glossary: [],
  copiedFrom: null,
  createdAt: null
}

function setup(): {
  create: ReturnType<typeof vi.fn>
  duplicate: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  exp: ReturnType<typeof vi.fn>
  imp: ReturnType<typeof vi.fn>
} {
  let presets: Preset[] = [series]
  const create = vi.fn(async (input: PresetInput) => {
    const p: Preset = {
      ...input,
      id: 'c1',
      builtin: false,
      copiedFrom: null,
      createdAt: '2026-11-19T00:00:00.000Z'
    }
    presets = [...presets, p]
    return { ok: true as const, data: p }
  })
  const duplicate = vi.fn(async () => {
    const p: Preset = {
      ...series,
      id: 'c2',
      builtin: false,
      name: 'Series (copy)',
      copiedFrom: series.id
    }
    presets = [...presets, p]
    return { ok: true as const, data: p }
  })
  const remove = vi.fn(async () => ({
    ok: false as const,
    error: { code: 'PRESET_IN_USE', message: 'x' }
  }))
  const exp = vi.fn(async () => ok({ path: '/out/presets.json', count: 1 }))
  const imp = vi.fn(async () =>
    ok({
      path: '/in/p.json',
      imported: [{ ...series, id: 'c3', builtin: false, name: 'Imported one' }],
      skipped: [{ index: 1, name: 'Series', reason: 'name-taken' }]
    })
  )
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
      get: () => ok(onboardedSettings)
    },
    presets: {
      list: async () => ok(presets),
      create,
      duplicate,
      delete: remove,
      export: exp,
      import: imp
    }
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/presets'] })
  })
  render(<App queryClient={queryClient} router={router} />)
  return { create, duplicate, remove, exp, imp }
}

afterEach(cleanup)

describe('Presets', () => {
  it('built-ins are read-only; duplicating opens the editable copy', async () => {
    const { duplicate } = setup()
    expect(await screen.findByText(/Built-in presets cannot be changed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save preset' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(duplicate).toHaveBeenCalledWith('builtin:series', 'Series (copy)')
    expect(await screen.findByText('Copied from Series')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeTruthy()
  })

  it('new preset: validation shows what to fix, then it saves trimmed', async () => {
    const { create } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'New preset' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    await userEvent.type(screen.getByLabelText('Term 1'), 'Frieren')
    await userEvent.click(screen.getByRole('button', { name: 'Save preset' }))
    expect(screen.getByText('Required.')).toBeTruthy()
    expect(screen.getByText('Add a translation or a rule.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Name'), ' Anime ')
    await userEvent.type(screen.getByLabelText('Rule 1'), 'keep the name')
    await userEvent.click(screen.getByRole('button', { name: 'Save preset' }))
    expect(create).toHaveBeenCalledWith({
      name: 'Anime',
      mediaType: 'Series',
      temperature: 0.45,
      prompt: '',
      glossary: [{ source: 'Frieren', rule: 'keep the name' }]
    })
  })

  it('recommends English prompts on editable presets without blocking a non-English one', async () => {
    const { create } = setup()
    // Read-only built-in: nothing to write, so no tip.
    expect(await screen.findByText(/Built-in presets cannot be changed/)).toBeTruthy()
    expect(screen.queryByText(/write these instructions in English/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'New preset' }))
    const tip = screen.getByText(/write these instructions in English/)
    expect(tip.closest('.text-destructive')).toBeNull()
    await userEvent.type(screen.getByLabelText('Name'), 'Anime')
    await userEvent.type(screen.getByLabelText('Style instructions'), 'Mantenha os honoríficos.')
    await userEvent.click(screen.getByRole('button', { name: 'Save preset' }))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Mantenha os honoríficos.' })
    )
  })

  it('deleting a preset in use explains why it was refused', async () => {
    const { remove } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(remove).toHaveBeenCalledWith('c2')
    expect(await screen.findByText('This preset is used by a queued or running job.')).toBeTruthy()
  })

  it('export the marked presets; import reports what was skipped', async () => {
    const { exp, imp } = setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select to export: Series' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export 1 preset' }))
    expect(exp).toHaveBeenCalledWith(['builtin:series'])

    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    await userEvent.click(await screen.findByLabelText('Skip it'))
    await userEvent.click(screen.getByRole('button', { name: 'Choose file' }))
    expect(imp).toHaveBeenCalledWith('skip')
    expect(await screen.findByText('Imported 1 preset.')).toBeTruthy()
    expect(screen.getByText('name already exists')).toBeTruthy()
  })

  it('adding and removing glossary rows never submits the form', async () => {
    const { create } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'New preset' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(screen.getByLabelText('Term 2')).toBeTruthy()
    // No validation messages: nothing was submitted.
    expect(screen.queryByText('Required.')).toBeNull()
    expect(screen.queryByText('Enter the term.')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove entry 2' }))
    expect(screen.queryByLabelText('Term 2')).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
})
