import type { JobStatus } from '@shared/ipc-contract'
import { i18n } from '@renderer/i18n'

/** States worth telling the user about when BakaSub is in the background. */
const NOTIFY: Partial<Record<JobStatus, 'done' | 'warnings' | 'failed' | 'confirm'>> = {
  completed: 'done',
  'completed-with-warnings': 'warnings',
  failed: 'failed',
  'awaiting-confirmation': 'confirm'
}

/**
 * Native notification (Electron supports the web `Notification`) for a job that changed state,
 * only while the window is not focused. Clicking it brings the window back on that job.
 */
export function notifyJob(
  job: { id: string; source: string },
  status: JobStatus,
  env: { focused: () => boolean } = { focused: () => document.hasFocus() }
): Notification | null {
  const kind = NOTIFY[status]
  if (!kind || env.focused() || typeof Notification === 'undefined') return null
  if (Notification.permission === 'denied') return null
  const n = new Notification(i18n.t(`common:notify.${kind}`), { body: job.source, tag: job.id })
  n.onclick = () => {
    window.focus()
    window.location.hash = `#/queue?job=${encodeURIComponent(job.id)}`
  }
  return n
}
