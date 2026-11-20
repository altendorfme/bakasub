import { ArrowUp, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageSelect } from '@renderer/components/common/language-select'
import { Switch } from '@renderer/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useSetting } from '@renderer/data/preferences'
import { usePresets } from '@renderer/data/presets'
import { languageName, TARGET_LANGUAGES } from '@renderer/lib/languages'
import { NumberSetting, SettingRow } from './setting-row'

export function GeneralSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [preset, setPreset] = useSetting('translation.defaultPresetId')
  const [concurrency, setConcurrency] = useSetting('jobs.concurrency')
  const [autoConfirm, setAutoConfirm] = useSetting('preflight.autoConfirmBelowUsd')
  const [level, setLevel] = useSetting('logs.level')
  const presets = usePresets().data ?? []

  return (
    <div className="divide-y">
      <SettingRow
        label={t('settings.general.language')}
        description={t('settings.general.languageHint')}
      >
        <LanguageSelect />
      </SettingRow>

      <SettingRow
        label={t('settings.general.defaultPreset')}
        description={t('settings.general.defaultPresetHint')}
      >
        <Select value={preset ?? ''} onValueChange={setPreset}>
          <SelectTrigger className="w-56" aria-label={t('settings.general.defaultPreset')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <NumberSetting
        label={t('settings.general.concurrency')}
        description={t('settings.general.concurrencyHint')}
        value={concurrency}
        min={1}
        max={4}
        onSave={(v) => v !== null && setConcurrency(v)}
      />

      <NumberSetting
        label={t('settings.general.autoConfirm')}
        description={t('settings.general.autoConfirmHint')}
        value={autoConfirm}
        min={0}
        max={1000}
        step={0.01}
        unit="US$"
        nullable
        emptyLabel={t('settings.general.always')}
        onSave={setAutoConfirm}
      />

      <SourceLangs />

      <SettingRow
        label={t('settings.general.verbose')}
        description={t('settings.general.verboseHint')}
      >
        <Switch
          aria-label={t('settings.general.verbose')}
          checked={level === 'debug'}
          onCheckedChange={(on) => setLevel(on ? 'debug' : 'info')}
        />
      </SettingRow>
    </div>
  )
}

/** Ordered list: the first match wins when a track is picked automatically. */
function SourceLangs(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [langs = [], setLangs] = useSetting('tracks.preferredSourceLangs')
  const name = (tag: string): string => languageName(tag, i18n.language)
  const available = TARGET_LANGUAGES.filter((l) => !langs.includes(l))
  return (
    <SettingRow
      label={t('settings.general.sourceLangs')}
      description={t('settings.general.sourceLangsHint')}
    >
      <div className="grid justify-items-end gap-2">
        <ol className="flex flex-wrap justify-end gap-1.5">
          {langs.map((tag, i) => (
            <li
              key={tag}
              className="flex items-center gap-1 rounded-full border bg-background/40 py-0.5 pr-1 pl-2.5 text-xs"
            >
              {name(tag)}
              {i > 0 ? (
                <button
                  type="button"
                  aria-label={t('settings.general.up', { name: name(tag) })}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setLangs([...langs.slice(0, i - 1), tag, langs[i - 1], ...langs.slice(i + 1)])
                  }
                >
                  <ArrowUp className="size-3" />
                </button>
              ) : null}
              {langs.length > 1 ? (
                <button
                  type="button"
                  aria-label={t('settings.general.remove', { name: name(tag) })}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setLangs(langs.filter((l) => l !== tag))}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ol>
        <Select value="" onValueChange={(v) => setLangs([...langs, v])}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label={t('settings.general.add')}>
            <span className="flex items-center gap-1.5">
              <Plus className="size-3.5" />
              {t('settings.general.add')}
            </span>
          </SelectTrigger>
          <SelectContent>
            {available.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {name(tag)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </SettingRow>
  )
}
