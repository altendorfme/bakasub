import { Coffee, ExternalLink, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { useAppInfo, useAppUpdate } from '@renderer/data/app'
import { qk } from '@renderer/data/query-keys'
import { errorMessage } from '@renderer/i18n/error-message'
import { unwrap } from '@renderer/lib/ipc'

export const REPOSITORY_URL = 'https://github.com/lsilvatti'
export const SUPPORT_URL = 'https://buymeacoffee.com/leosilvatto'

export function AboutSection(): React.JSX.Element {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const info = useAppInfo().data
  const update = useAppUpdate()
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={update.isFetching}
          onClick={() => void qc.invalidateQueries({ queryKey: qk.app.update() })}
        >
          <RefreshCw className={update.isFetching ? 'animate-spin' : ''} />
          {t('settings.about.checkUpdate')}
        </Button>
        <Button onClick={() => open(REPOSITORY_URL)}>
          <ExternalLink />
          {t('settings.about.repository')}
        </Button>
        <Button variant="default" onClick={() => open(SUPPORT_URL)}>
          <Coffee />
          {t('settings.about.coffee')}
        </Button>
      </div>
      {update.data ? (
        <p className={update.data.updateAvailable ? 'text-primary' : 'text-muted-foreground'}>
          {update.data.offline
            ? t('settings.about.offline')
            : update.data.updateAvailable
              ? t('settings.about.update', { latest: update.data.latest })
              : t('settings.about.upToDate')}
        </p>
      ) : null}

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
