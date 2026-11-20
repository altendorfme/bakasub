import { useTranslation } from 'react-i18next'
import { useModels } from '@renderer/data/models'
import { usePresets } from '@renderer/data/presets'
import { useSettings } from '@renderer/data/settings'
import { languageName } from '@renderer/lib/languages'
import { presetLabel } from '@renderer/lib/preset-labels'

/** Names for a settings set; `null` values resolve to the Settings defaults, as the Main does. */
export function useSettingsLabels(): {
  preset: (id: string | null) => string
  model: (id: string | null) => string
  lang: (tag: string | null) => string
} {
  const { t, i18n } = useTranslation()
  const presets = usePresets().data ?? []
  const settings = useSettings().data
  const catalog = useModels().data?.models ?? []
  return {
    preset: (id) => {
      const p = presets.find((x) => x.id === (id ?? settings?.['translation.defaultPresetId']))
      return p ? presetLabel(p, t) : t('batch.summary.none')
    },
    model: (id) => {
      const m = id ?? settings?.['translation.defaultModel'] ?? null
      return m ? (catalog.find((x) => x.id === m)?.name ?? m) : t('batch.summary.none')
    },
    lang: (tag) => {
      const l = tag ?? settings?.['translation.defaultTargetLang'] ?? null
      return l ? languageName(l, i18n.language) : t('batch.summary.none')
    }
  }
}
