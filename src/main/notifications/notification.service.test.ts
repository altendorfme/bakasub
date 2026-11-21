import { describe, expect, it, vi } from 'vitest'
import {
  NotificationService,
  type NativeNotificationLike,
  type NotificationKind,
  type NotificationRequest
} from './notification.service'

class FakeNotification implements NativeNotificationLike {
  readonly handlers: Record<string, ((...a: unknown[]) => void)[]> = {}
  shown = false
  constructor(readonly opts: { title: string; body: string }) {}
  on(event: string, listener: (...a: unknown[]) => void): this {
    ;(this.handlers[event] ??= []).push(listener)
    return this
  }
  show(): void {
    this.shown = true
  }
  emit(event: string, ...a: unknown[]): void {
    for (const l of this.handlers[event] ?? []) l(...a)
  }
}

const req: NotificationRequest = {
  kind: 'job',
  title: 'Job finished',
  body: 'ep01.mkv',
  target: { kind: 'job', id: 'j1' }
}

function setup(
  o: {
    focused?: boolean
    supported?: boolean
    enabled?: (k: NotificationKind) => boolean
    create?: () => FakeNotification
  } = {}
): {
  svc: NotificationService
  created: FakeNotification[]
  reveal: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
} {
  const created: FakeNotification[] = []
  const reveal = vi.fn()
  const warn = vi.fn()
  const svc = new NotificationService({
    isSupported: () => o.supported ?? true,
    create: (n) => {
      const f = o.create?.() ?? new FakeNotification(n)
      created.push(f)
      return f
    },
    window: { isFocused: () => o.focused ?? false, reveal },
    enabled: async (k) => o.enabled?.(k) ?? true,
    log: { warn }
  })
  return { svc, created, reveal, warn }
}

describe('NotificationService', () => {
  it('shows a native notification while the window is in the background', async () => {
    const { svc, created } = setup()
    expect(await svc.notify(req)).toBe(true)
    expect(created).toHaveLength(1)
    expect(created[0].opts).toEqual({ title: 'Job finished', body: 'ep01.mkv' })
    expect(created[0].shown).toBe(true)
  })

  it('is suppressed while the main window is focused (errors included)', async () => {
    const { svc, created } = setup({ focused: true })
    expect(await svc.notify({ ...req, title: 'Job failed' })).toBe(false)
    expect(created).toHaveLength(0)
  })

  it('respects the settings for the category', async () => {
    const { svc, created } = setup({ enabled: (k) => k !== 'batch' })
    expect(await svc.notify({ ...req, kind: 'batch' })).toBe(false)
    expect(await svc.notify(req)).toBe(true)
    expect(created).toHaveLength(1)
  })

  it('does nothing where the platform has no notifications', async () => {
    const { svc, created } = setup({ supported: false })
    expect(svc.isSupported()).toBe(false)
    expect(await svc.notify(req)).toBe(false)
    expect(created).toHaveLength(0)
  })

  it('a click reveals the window on the target and releases the reference', async () => {
    const { svc, created, reveal } = setup()
    await svc.notify(req)
    expect(svc.pending).toBe(1)
    created[0].emit('click')
    expect(reveal).toHaveBeenCalledWith({ kind: 'job', id: 'j1' })
    expect(svc.pending).toBe(0)
  })

  it('a closed notification is released without revealing', async () => {
    const { svc, created, reveal } = setup()
    await svc.notify(req)
    created[0].emit('close')
    expect(svc.pending).toBe(0)
    expect(reveal).not.toHaveBeenCalled()
  })

  it('never throws: platform failures become a log entry', async () => {
    const { svc, warn } = setup({
      create: () => {
        throw new Error('dbus down')
      }
    })
    await expect(svc.notify(req)).resolves.toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('a failing settings read or reveal does not throw either', async () => {
    const reveal = vi.fn(() => {
      throw new Error('destroyed')
    })
    const warn = vi.fn()
    const created: FakeNotification[] = []
    const svc = new NotificationService({
      isSupported: () => true,
      create: (n) => {
        const f = new FakeNotification(n)
        created.push(f)
        return f
      },
      window: { isFocused: () => false, reveal },
      enabled: async () => true,
      log: { warn }
    })
    await svc.notify(req)
    expect(() => created[0].emit('click')).not.toThrow()
    expect(warn).toHaveBeenCalledWith('notification click failed', expect.any(Error))

    const broken = new NotificationService({
      isSupported: () => true,
      create: (n) => new FakeNotification(n),
      window: { isFocused: () => false, reveal },
      enabled: () => Promise.reject(new Error('db closed')),
      log: { warn }
    })
    await expect(broken.notify(req)).resolves.toBe(false)
  })
})
