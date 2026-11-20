import { ChevronDown, Coffee, Download, ExternalLink, RefreshCw, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AppUpdateStatus } from '@shared/ipc-contract'
import { ReleaseNotes } from '@renderer/components/common/release-notes'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter } from '@renderer/components/ui/dialog'
import { Progress } from '@renderer/components/ui/progress'
import {
  useAppInfo,
  useAppUpdateStatus,
  useCancelUpdateDownload,
  useCheckUpdate,
  useDownloadUpdate,
  useInstallUpdate
} from '@renderer/data/app'
import { useSetting } from '@renderer/data/preferences'
import { errorMessage } from '@renderer/i18n/error-message'
import { formatBytes } from '@renderer/lib/format'
import { IpcCallError, unwrap } from '@renderer/lib/ipc'
import { SettingRow } from './setting-row'

export const REPOSITORY_URL = 'https://github.com/lsilvatti'
export const SUPPORT_URL = 'https://buymeacoffee.com/leosilvatto'

export function AboutSection(): React.JSX.Element {
  const { t } = useTranslation()
  const info = useAppInfo().data
  const open = (url: string): void =>
    void unwrap(window.api.app.openExternal(url)).catch((err: unknown) =>
      toast.error(errorMessage(err))
    )

  return (
    <div className="grid gap-4 text-sm">
      {info ? (
        <div className="grid gap-0.5">
          <p className="text-base font-semibold">
            {info.name} · {t('settings.about.version', { version: info.version })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('settings.about.platform', {
              platform: info.platform,
              arch: info.arch,
              electron: info.electron
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('settings.about.author', { name: 'Leonardo Silvatti' })}
          </p>
        </div>
      ) : null}

      <UpdatePanel open={open} />
      <AutoCheck />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => open(REPOSITORY_URL)}>
          <ExternalLink />
          {t('settings.about.repository')}
        </Button>
        <Button variant="default" onClick={() => open(SUPPORT_URL)}>
          <Coffee />
          {t('settings.about.coffee')}
        </Button>
      </div>

      {info ? (
        <p className="grid gap-0.5">
          <span className="text-xs text-muted-foreground">{t('settings.about.data')}</span>
          <code className="text-xs break-all">{info.userDataPath}</code>
        </p>
      ) : null}
      <div className="grid gap-2 border-t pt-4 text-xs text-muted-foreground">
        <p>{t('settings.about.tmdb')}</p>
        <p>{t('settings.about.openrouter')}</p>
      </div>
    </div>
  )
}

function AutoCheck(): React.JSX.Element {
  const { t } = useTranslation()
  const [autoCheck, setAutoCheck] = useSetting('updates.autoCheck')
  return (
    <SettingRow
      label={t('settings.about.autoCheck')}
      description={t('settings.about.autoCheckHint')}
    >
      <Switch
        aria-label={t('settings.about.autoCheck')}
        checked={autoCheck ?? true}
        onCheckedChange={setAutoCheck}
      />
    </SettingRow>
  )
}

/** Check → Download (size) → Restart and update, each step an explicit click. */
function UpdatePanel({ open }: { open: (url: string) => void }): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const status = useAppUpdateStatus().data
  const check = useCheckUpdate()
  const download = useDownloadUpdate()
  const cancel = useCancelUpdateDownload()
  const install = useInstallUpdate()
  const [confirmJobs, setConfirmJobs] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  const state = status?.state ?? 'idle'
  const fail = (err: unknown): void => void toast.error(errorMessage(err))
  const runCheck = (): void => check.mutate(undefined, { onError: fail })
  const runInstall = (confirmed: boolean): void =>
    install.mutate(confirmed ? { confirmJobs: true } : {}, {
      onError: (err) => {
        if (!confirmed && err instanceof IpcCallError && err.code === 'UPDATE_JOBS_ACTIVE') {
          setConfirmJobs(true)
        } else {
          setConfirmJobs(false)
          fail(err)
        }
      },
      onSuccess: () => setConfirmJobs(false)
    })

  const checkButton = (label: string): React.JSX.Element => (
    <Button disabled={check.isPending} onClick={runCheck}>
      <RefreshCw className={check.isPending ? 'animate-spin' : ''} />
      {label}
    </Button>
  )

  return (
    <section
      aria-label={t('settings.about.updates')}
      className="grid gap-3 rounded-lg border bg-background/40 p-3"
    >
      {state === 'unsupported' ? (
        <>
          <p className="text-muted-foreground">{t('settings.about.unsupported')}</p>
          {status?.fallbackUrl ? (
            <div>
              <Button onClick={() => open(status.fallbackUrl!)}>
                <ExternalLink />
                {t('settings.about.openRelease')}
              </Button>
            </div>
          ) : null}
        </>
      ) : state === 'checking' ? (
        <div className="flex items-center gap-2 text-muted-foreground" role="status">
          <RefreshCw className="size-4 animate-spin" aria-hidden />
          {t('settings.about.checking')}
        </div>
      ) : state === 'available' ? (
        <>
          <p className="text-primary">
            {t('settings.about.update', { latest: status?.latest })}
            {status?.size ? (
              <span className="ml-1 text-muted-foreground">
                ({formatBytes(status.size, i18n.language)})
              </span>
            ) : null}
          </p>
          <Notes status={status} open={notesOpen} onToggle={() => setNotesOpen((o) => !o)} />
          <div>
            <Button
              disabled={download.isPending}
              onClick={() => download.mutate(undefined, { onError: fail })}
            >
              <Download />
              {t('settings.about.download')}
            </Button>
          </div>
        </>
      ) : state === 'downloading' ? (
        <>
          <p>{t('settings.about.downloading', { latest: status?.latest })}</p>
          <Progress
            value={Math.round(status?.progress?.percent ?? 0)}
            aria-label={t('settings.about.downloadProgress')}
          />
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {Math.round(status?.progress?.percent ?? 0)}%
              {status?.progress
                ? ` · ${formatBytes(status.progress.transferred, i18n.language)} / ${formatBytes(status.progress.total, i18n.language)}`
                : ''}
            </span>
            <Button
              variant="ghost"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(undefined, { onError: fail })}
            >
              {t('settings.about.cancelDownload')}
            </Button>
          </div>
        </>
      ) : state === 'downloaded' ? (
        <>
          <p className="text-primary">{t('settings.about.ready', { latest: status?.latest })}</p>
          <Notes status={status} open={notesOpen} onToggle={() => setNotesOpen((o) => !o)} />
          <div>
            <Button disabled={install.isPending} onClick={() => runInstall(false)}>
              <RotateCw />
              {t('settings.about.install')}
            </Button>
          </div>
        </>
      ) : state === 'error' ? (
        <>
          <p role="alert" className="text-muted-foreground">
            {status?.offline
              ? t('settings.about.offline')
              : status?.error
                ? errorMessage(new IpcCallError(status.error.code, status.error.message))
                : t('settings.about.failed')}
          </p>
          <div>{checkButton(t('settings.about.retry'))}</div>
        </>
      ) : (
        <>
          {state === 'not-available' ? (
            <p className="text-muted-foreground">{t('settings.about.upToDate')}</p>
          ) : null}
          <div>{checkButton(t('settings.about.checkUpdate'))}</div>
        </>
      )}

      <Dialog open={confirmJobs} onOpenChange={setConfirmJobs}>
        <DialogContent
          title={t('settings.about.jobsTitle')}
          description={t('settings.about.jobsBody')}
        >
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmJobs(false)}>
              {t('settings.about.jobsBack')}
            </Button>
            <Button
              variant="destructive"
              disabled={install.isPending}
              onClick={() => runInstall(true)}
            >
              {t('settings.about.jobsConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function Notes({
  status,
  open,
  onToggle
}: {
  status: AppUpdateStatus | undefined
  open: boolean
  onToggle: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  if (!status?.notes) return null
  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={open ? 'size-3.5 rotate-180' : 'size-3.5'} aria-hidden />
        {open ? t('settings.about.hideNotes') : t('settings.about.showNotes')}
      </button>
      {open ? <ReleaseNotes html={status.notes} /> : null}
    </div>
  )
}
