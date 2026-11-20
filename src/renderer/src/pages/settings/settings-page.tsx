import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { AboutSection } from './about-section'
import { AdvancedSection } from './advanced-section'
import { CacheSection } from './cache-section'
import { GeneralSection } from './general-section'
import { KeysSection } from './keys-section'
import { ToolsSection } from './tools-section'

const TABS = [
  ['general', GeneralSection],
  ['keys', KeysSection],
  ['cache', CacheSection],
  ['tools', ToolsSection],
  ['advanced', AdvancedSection],
  ['about', AboutSection]
] as const

export function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="mx-auto grid max-w-3xl gap-5 px-6 py-7">
      <h1 className="text-xl font-semibold tracking-tight">{t('pages.settings.title')}</h1>
      <Tabs defaultValue="general" className="grid gap-5">
        <TabsList className="flex-wrap">
          {TABS.map(([id]) => (
            <TabsTrigger key={id} value={id}>
              {t(`settings.tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(([id, Section]) => (
          <TabsContent key={id} value={id} className="rounded-xl border bg-card/92 p-5">
            <Section />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
