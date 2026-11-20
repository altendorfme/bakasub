import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { PageKey } from './pages'

/** Code-split per screen: each one loads on first visit (the shell and Translate stay small). */
const page = <M>(load: () => Promise<M>, name: keyof M): LazyExoticComponent<ComponentType> =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }))

/** Screens already built; the router shows a placeholder for the rest. */
export const SCREENS: Partial<Record<PageKey, LazyExoticComponent<ComponentType>>> = {
  translate: page(() => import('@renderer/pages/translate/translate-entry'), 'TranslateEntry'),
  queue: page(() => import('@renderer/pages/queue/queue-page'), 'QueuePage'),
  settings: page(() => import('@renderer/pages/settings/settings-page'), 'SettingsPage'),
  models: page(() => import('@renderer/pages/models/models-page'), 'ModelsPage'),
  languages: page(() => import('@renderer/pages/languages/languages-page'), 'LanguagesPage'),
  presets: page(() => import('@renderer/pages/presets/presets-page'), 'PresetsPage'),
  extract: page(() => import('@renderer/pages/extract/extract-page'), 'ExtractPage'),
  mux: page(() => import('@renderer/pages/mux/mux-page'), 'MuxPage'),
  logs: page(() => import('@renderer/pages/logs/logs-page'), 'LogsPage')
}

export const WelcomeScreen = page(
  () => import('@renderer/pages/welcome/welcome-page'),
  'WelcomePage'
)
