import { useTranslation } from 'react-i18next'
import { GuideDialog } from '@renderer/components/common/guide-dialog'
import { ModelPicker } from '@renderer/components/pickers/model-picker'
import { useListWithDefault } from '@renderer/data/preferences'

export function ModelsStep(): React.JSX.Element {
  const { t } = useTranslation()
  const models = useListWithDefault('models.favorites', 'translation.defaultModel')
  return (
    <div className="grid gap-2">
      <div className="justify-self-end">
        <GuideDialog id="choosing-models" label={t('guides.choosing-models')} />
      </div>
      <ModelPicker value={models.value} onChange={models.onChange} disabled={!models.ready} />
    </div>
  )
}
