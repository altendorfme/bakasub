import { useTranslation } from 'react-i18next'
import { useAppInfo, useAppUpdate } from '@renderer/data/app'

export function AboutSection(): React.JSX.Element {
  const { t } = useTranslation()
  const info = useAppInfo().data
  const update = useAppUpdate().data
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
        </div>
      ) : null}
      {update ? (
        <p className={update.updateAvailable ? 'text-primary' : 'text-muted-foreground'}>
          {update.offline
            ? t('settings.about.offline')
            : update.updateAvailable
              ? t('settings.about.update', { latest: update.latest })
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
