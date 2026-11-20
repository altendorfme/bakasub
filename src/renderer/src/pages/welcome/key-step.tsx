import { useTranslation } from 'react-i18next'
import { GuideDialog } from '@renderer/components/common/guide-dialog'
import { KeyForm } from '@renderer/components/forms/key-form'
import { useApiKeyStatus, useSetApiKey } from '@renderer/data/settings'

export function KeyStep(): React.JSX.Element {
  const { t } = useTranslation()
  const status = useApiKeyStatus()
  const save = useSetApiKey()
  return (
    <KeyForm
      label={t('welcome.key.label')}
      placeholder="sk-or-v1-…"
      present={!!status.data?.present}
      noKeyring={status.data?.protection === 'none'}
      saving={save.isPending}
      error={save.error}
      onSave={(key) => save.mutateAsync(key)}
      guide={<GuideDialog id="openrouter-key" />}
    />
  )
}
