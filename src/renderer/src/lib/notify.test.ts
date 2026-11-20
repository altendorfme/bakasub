// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyJob } from './notify'

const created: { title: string; body?: string }[] = []
class FakeNotification {
  static permission = 'default'
  onclick: (() => void) | null = null
  constructor(title: string, o?: { body?: string }) {
    created.push({ title, body: o?.body })
  }
}

afterEach(() => {
  created.length = 0
  vi.unstubAllGlobals()
})

describe('notifyJob', () => {
  it('only in the background, only for states that need the user', () => {
    vi.stubGlobal('Notification', FakeNotification)
    const job = { id: 'j1', source: 'ep01.mkv' }
    expect(notifyJob(job, 'completed', { focused: () => true })).toBeNull()
    expect(notifyJob(job, 'running', { focused: () => false })).toBeNull()
    const n = notifyJob(job, 'completed', { focused: () => false })
    expect(created).toEqual([{ title: 'Translation finished', body: 'ep01.mkv' }])
    n!.onclick!(new Event('click'))
    expect(window.location.hash).toBe('#/queue?job=j1')
  })
})
