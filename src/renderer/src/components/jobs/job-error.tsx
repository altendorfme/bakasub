import { useTranslation } from 'react-i18next'
import type { Job } from '@shared/ipc-contract'
import { Button } from '@renderer/components/ui/button'
import { useInstallSidecars, useSidecarReport } from '@renderer/data/sidecars'
import { errorMessage } from '@renderer/i18n/error-message'
import { IpcCallError } from '@renderer/lib/ipc'
import { nextUtcMidnight } from '@renderer/lib/utc-reset'

/** The localized error plus what the user can do about it (by code, never by message). */
export function JobError({ job }: { job: Job }): React.JSX.Element | null {
  const { t, i18n } = useTranslation()
  const report = useSidecarReport()
  const install = useInstallSidecars()
  if (job.status === 'interrupted')
    return <p className="text-sm text-muted-foreground">{t('jobs.hint.interrupted')}</p>
  if (!job.error || job.status !== 'failed') return null
  const code = job.error.code
  const missing =
    report.data?.tools.filter((x) => x.state !== 'ok' && x.state !== 'unsupported') ?? []

  return (
    <div
      role="alert"
      className="grid gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <p>{errorMessage(new IpcCallError(code, job.error.message))}</p>
      {code === 'LLM_DAILY_LIMIT' ? (
        <p className="text-xs text-muted-foreground">
          {t('jobs.hint.dailyLimit', {
            time: new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }).format(
              nextUtcMidnight()
            )
          })}
        </p>
      ) : null}
      {code === 'LLM_CREDITS' ? (
        <Button
          size="sm"
          className="justify-self-start"
          onClick={() => void window.api.app.openExternal('https://openrouter.ai/settings/credits')}
        >
          {t('jobs.hint.credits')}
        </Button>
      ) : null}
      {code === 'LLM_NO_ENDPOINT' ? (
        <Button
          size="sm"
          className="justify-self-start"
          onClick={() => void window.api.app.openExternal('https://openrouter.ai/settings/privacy')}
        >
          {t('jobs.hint.privacy')}
        </Button>
      ) : null}
      {code === 'SIDECAR_MISSING' && missing.length > 0 ? (
        <Button
          size="sm"
          className="justify-self-start"
          disabled={install.isPending}
          onClick={() => install.mutate(missing.map((x) => x.name))}
        >
          {t('jobs.hint.sidecar')}
        </Button>
      ) : null}
    </div>
  )
}
