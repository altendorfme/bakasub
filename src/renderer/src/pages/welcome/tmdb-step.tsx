import { useTranslation } from 'react-i18next'
import { GuideDialog } from '@renderer/components/common/guide-dialog'
import { KeyForm } from '@renderer/components/forms/key-form'
import { useSetTmdbKey, useTmdbKeyStatus } from '@renderer/data/settings'

export function TmdbStep(): React.JSX.Element {
  const { t } = useTranslation()
  const status = useTmdbKeyStatus()
  const save = useSetTmdbKey()
  return (
    <div className="grid gap-3">
      <KeyForm
        label={t('welcome.tmdb.label')}
        present={!!status.data?.present}
        saving={save.isPending}
        error={save.error}
        onSave={(key) => save.mutateAsync(key)}
        guide={<GuideDialog id="tmdb-key" />}
      />
      <p className="text-xs text-muted-foreground">{t('welcome.tmdb.attribution')}</p>
    </div>
  )
}
