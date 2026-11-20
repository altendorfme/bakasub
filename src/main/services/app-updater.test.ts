import { describe, expect, it, vi } from 'vitest'
import {
  AppUpdater,
  scheduleAutoCheck,
  type AppUpdaterDeps,
  type CancelTokenLike,
  type UpdaterLike
} from './app-updater'
import type { AppUpdateStatus } from '../../shared/ipc-contract'

function fakeUpdater(): UpdaterLike & {
  handlers: Record<string, (...a: never[]) => void>
  releaseDownload: () => void
  failDownload: (e: unknown) => void
} {
  let resolveDl: () => void = () => undefined
  let rejectDl: (e: unknown) => void = () => undefined
  const handlers: Record<string, (...a: never[]) => void> = {}
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    logger: null,
    handlers,
    on: (e, l) => {
      handlers[e] = l
    },
    checkForUpdates: vi.fn(async () => ({
      isUpdateAvailable: true,
      updateInfo: {
        version: '2.0.0',
        releaseDate: '2026-11-20T00:00:00.000Z',
        releaseNotes: '<p>notes</p>',
        files: [{ size: 1234 }]
      }
    })),
    downloadUpdate: vi.fn(
      () =>
        new Promise((res, rej) => {
          resolveDl = () => res(undefined)
          rejectDl = rej
        })
    ),
    quitAndInstall: vi.fn(),
    releaseDownload: () => resolveDl(),
    failDownload: (e) => rejectDl(e)
  }
}

interface Rig {
  u: AppUpdater
  updater: ReturnType<typeof fakeUpdater>
  events: AppUpdateStatus[]
  deps: AppUpdaterDeps
  token: CancelTokenLike
  order: string[]
}

function setup(over: Partial<AppUpdaterDeps> = {}): Rig {
  const updater = fakeUpdater()
  const events: AppUpdateStatus[] = []
  const token: CancelTokenLike = { cancel: vi.fn() }
  const order: string[] = []
  const deps: AppUpdaterDeps = {
    updater,
    newCancelToken: () => token,
    currentVersion: '1.0.0',
    isPackaged: true,
    platform: 'win32',
    appImagePath: undefined,
    emit: (s) => events.push(s),
    hasActiveJobs: () => false,
    shutdown: vi.fn(async () => {
      order.push('shutdown')
    }),
    abort: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    now: () => 1_000_000,
    ...over
  }
  ;(updater.quitAndInstall as ReturnType<typeof vi.fn>).mockImplementation(() => {
    order.push('quitAndInstall')
  })
  return { u: new AppUpdater(deps), updater, events, deps, token, order }
}

const flush = (): Promise<unknown> => new Promise((r) => setImmediate(r))

describe('AppUpdater', () => {
  it('forces the safe updater flags', () => {
    const { updater } = setup()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
  })

  it('idle -> checking -> available, never downloading by itself', async () => {
    const { u, events, updater } = setup()
    const info = await u.check()
    expect(events.map((e) => e.state)).toEqual(['checking', 'available'])
    expect(info).toMatchObject({
      current: '1.0.0',
      latest: '2.0.0',
      updateAvailable: true,
      state: 'available',
      size: 1234,
      notes: '<p>notes</p>',
      offline: false
    })
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('reports not-available when the latest is not newer', async () => {
    const { u, updater } = setup()
    ;(updater.checkForUpdates as ReturnType<typeof vi.fn>).mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.0.0' }
    })
    const info = await u.check()
    expect(info).toMatchObject({ state: 'not-available', updateAvailable: false, latest: '1.0.0' })
  })

  it('coalesces concurrent checks', async () => {
    const { u, updater } = setup()
    await Promise.all([u.check(), u.check()])
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('offline: check resolves with state error and offline=true', async () => {
    const { u, updater } = setup()
    ;(updater.checkForUpdates as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('net::ERR_INTERNET_DISCONNECTED'), {
        code: 'ERR_INTERNET_DISCONNECTED'
      })
    )
    const info = await u.check()
    expect(info).toMatchObject({ state: 'error', offline: true, updateAvailable: false })
    expect(info.error?.code).toBe('NETWORK')
    // O app segue: um novo check volta a funcionar.
    ;(updater.checkForUpdates as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    expect((await u.check()).state).toBe('not-available')
  })

  it('non-network failures are errors without offline', async () => {
    const { u, updater } = setup()
    ;(updater.checkForUpdates as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad yml'))
    const info = await u.check()
    expect(info).toMatchObject({ state: 'error', offline: false })
    expect(info.error?.code).toBe('INTERNAL')
  })

  it('download requires available', () => {
    const { u } = setup()
    expect(() => u.download()).toThrowError(expect.objectContaining({ code: 'UPDATE_NOT_READY' }))
  })

  it('download -> progress (throttled) -> downloaded', async () => {
    let t = 0
    const { u, updater, events } = setup({ now: () => t })
    await u.check()
    const status = u.download()
    expect(status.state).toBe('downloading')
    const progress = updater.handlers['download-progress']!
    const p = (percent: number): void =>
      progress({ percent, transferred: percent, total: 100, bytesPerSecond: 1 } as never)
    t = 1000
    p(10)
    t = 1100
    p(20) // throttled
    t = 1400
    p(30)
    expect(events.filter((e) => e.progress).map((e) => e.progress!.percent)).toEqual([10, 30])
    updater.releaseDownload()
    await flush()
    expect(u.getStatus().state).toBe('downloaded')
    expect(u.getStatus().progress).toBeUndefined()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('cancel returns to available', async () => {
    const { u, updater, token } = setup()
    await u.check()
    u.download()
    expect(u.cancelDownload()).toEqual({ cancelled: true })
    expect(token.cancel).toHaveBeenCalled()
    updater.failDownload(new Error('cancelled'))
    await flush()
    expect(u.getStatus().state).toBe('available')
    expect(u.cancelDownload()).toEqual({ cancelled: false })
  })

  it('download failure becomes error state', async () => {
    const { u, updater } = setup()
    await u.check()
    u.download()
    updater.failDownload(Object.assign(new Error('boom'), { code: 'ECONNRESET' }))
    await flush()
    expect(u.getStatus()).toMatchObject({ state: 'error', offline: true })
  })

  async function downloaded(over: Partial<AppUpdaterDeps> = {}): Promise<Rig> {
    const s = setup(over)
    await s.u.check()
    s.u.download()
    s.updater.releaseDownload()
    await flush()
    return s
  }

  it('install is refused before the download finishes', async () => {
    const { u } = setup()
    await u.check()
    await expect(u.install({})).rejects.toMatchObject({ code: 'UPDATE_NOT_READY' })
  })

  it('install refuses with active jobs unless confirmed', async () => {
    const { u, updater, deps } = await downloaded({ hasActiveJobs: () => true })
    await expect(u.install({})).rejects.toMatchObject({ code: 'UPDATE_JOBS_ACTIVE' })
    expect(deps.shutdown).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('confirmed install runs the shutdown coordinator BEFORE quitAndInstall', async () => {
    const { u, updater, order } = await downloaded({ hasActiveJobs: () => true })
    await expect(u.install({ confirmJobs: true })).resolves.toEqual({ installing: true })
    expect(order).toEqual(['shutdown', 'quitAndInstall'])
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    // Idempotente: um segundo clique não reinstala.
    await u.install({ confirmJobs: true })
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('install without jobs needs no confirmation', async () => {
    const { u, order } = await downloaded()
    await u.install({})
    expect(order).toEqual(['shutdown', 'quitAndInstall'])
  })

  it('aborts the process if quitAndInstall throws after shutdown', async () => {
    const { u, updater, deps } = await downloaded()
    ;(updater.quitAndInstall as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('spawn failed')
    })
    await expect(u.install({})).rejects.toThrow('spawn failed')
    expect(deps.abort).toHaveBeenCalled()
  })

  describe('unsupported', () => {
    it.each([
      ['dev build', { isPackaged: false, platform: 'linux' as const }],
      ['linux without APPIMAGE', { isPackaged: true, platform: 'linux' as const }],
      ['macOS', { isPackaged: true, platform: 'darwin' as const }]
    ])('%s', async (_n, over) => {
      const { u, updater, events, deps } = setup(over)
      const info = await u.check()
      expect(info).toMatchObject({
        state: 'unsupported',
        updateAvailable: false,
        fallbackUrl: 'https://github.com/lsilvatti/bakasub/releases/latest'
      })
      expect(updater.checkForUpdates).not.toHaveBeenCalled()
      expect(events).toEqual([])
      expect(deps.log.error).not.toHaveBeenCalled()
      expect(deps.log.warn).not.toHaveBeenCalled()
      expect(() => u.download()).toThrowError(
        expect.objectContaining({ code: 'UPDATE_UNSUPPORTED' })
      )
      await expect(u.install({})).rejects.toMatchObject({ code: 'UPDATE_UNSUPPORTED' })
    })

    it('AppImage on linux is supported', async () => {
      const { u } = setup({
        isPackaged: true,
        platform: 'linux',
        appImagePath: '/x/BakaSub.AppImage'
      })
      expect((await u.check()).state).toBe('available')
    })
  })
})

describe('scheduleAutoCheck', () => {
  it('checks once after the delay when enabled', async () => {
    vi.useFakeTimers()
    const check = vi.fn().mockResolvedValue({})
    scheduleAutoCheck(
      { check },
      { enabled: async () => true, delayMs: 100, log: { warn: vi.fn() } }
    )
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(check).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('does nothing when the setting is off', async () => {
    vi.useFakeTimers()
    const check = vi.fn()
    scheduleAutoCheck(
      { check },
      { enabled: async () => false, delayMs: 100, log: { warn: vi.fn() } }
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(check).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('can be cancelled', async () => {
    vi.useFakeTimers()
    const check = vi.fn()
    const cancel = scheduleAutoCheck(
      { check },
      { enabled: async () => true, delayMs: 100, log: { warn: vi.fn() } }
    )
    cancel()
    await vi.advanceTimersByTimeAsync(200)
    expect(check).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
