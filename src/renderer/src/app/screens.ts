import { LanguagesPage } from '@renderer/pages/languages/languages-page'
import { ModelsPage } from '@renderer/pages/models/models-page'
import { PresetsPage } from '@renderer/pages/presets/presets-page'
import { QueuePage } from '@renderer/pages/queue/queue-page'
import { SettingsPage } from '@renderer/pages/settings/settings-page'
import { TranslatePage } from '@renderer/pages/translate/translate-page'
import type { PageKey } from './pages'

/** Screens already built; the router shows a placeholder for the rest. */
export const SCREENS: Partial<Record<PageKey, () => React.JSX.Element>> = {
  translate: TranslatePage,
  queue: QueuePage,
  settings: SettingsPage,
  models: ModelsPage,
  languages: LanguagesPage,
  presets: PresetsPage
}
