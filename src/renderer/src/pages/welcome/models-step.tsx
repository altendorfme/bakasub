import { ModelPicker } from '@renderer/components/pickers/model-picker'
import { useListWithDefault } from '@renderer/data/preferences'

export function ModelsStep(): React.JSX.Element {
  const models = useListWithDefault('models.favorites', 'translation.defaultModel')
  return <ModelPicker value={models.value} onChange={models.onChange} disabled={!models.ready} />
}
