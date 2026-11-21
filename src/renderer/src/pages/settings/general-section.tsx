import { ArrowUp, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
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
import { presetLabel } from '@renderer/lib/preset-labels'
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
                {presetLabel(p, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <NumberSetting
        label={t('settings.general.concurrency')}
        description={t('settings.general.concurrencyHint')}
        help={t('help.concurrency')}
        value={concurrency}
        min={1}
        max={4}
        onSave={(v) => v !== null && setConcurrency(v)}
      />

      <NumberSetting
        label={t('settings.general.autoConfirm')}
        description={t('settings.general.autoConfirmHint')}
        help={t('help.autoConfirm')}
        value={autoConfirm}
        min={0}
        max={1000}
        step={0.01}
        unit="US$"
        nullable
        emptyLabel={t('settings.general.always')}
        inputClassName="w-48"
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

      <Notifications />
    </div>
  )
}

const CATEGORIES = [
  ['notifications.job', 'notifyJob'],
  ['notifications.batch', 'notifyBatch'],
  ['notifications.update', 'notifyUpdate']
] as const

/** Native OS notifications (Main), only while BakaSub is in the background. */
function Notifications(): React.JSX.Element {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useSetting('notifications.enabled')
  const on = enabled ?? true
  return (
    <>
      <SettingRow
        label={t('settings.general.notifications')}
        description={t('settings.general.notificationsHint')}
      >
        <Switch
          aria-label={t('settings.general.notifications')}
          checked={on}
          onCheckedChange={setEnabled}
        />
      </SettingRow>
      {CATEGORIES.map(([key, label]) => (
        <NotificationCategory key={key} setting={key} label={label} disabled={!on} />
      ))}
    </>
  )
}

function NotificationCategory({
  setting,
  label,
  disabled
}: {
  setting: (typeof CATEGORIES)[number][0]
  label: (typeof CATEGORIES)[number][1]
  disabled: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useSetting(setting)
  return (
    <div className={disabled ? 'pl-4 opacity-60' : 'pl-4'}>
      <SettingRow
        label={t(`settings.general.${label}`)}
        description={t(`settings.general.${label}Hint`)}
      >
        <Switch
          aria-label={t(`settings.general.${label}`)}
          checked={value ?? true}
          disabled={disabled}
          onCheckedChange={setValue}
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
      help={t('help.sourceLangs')}
    >
      {/* An ordered list: position matters (first match wins), so it reads as a ranking. */}
      <div className="grid w-64 gap-2">
        <ol className="grid divide-y rounded-md border bg-background/40">
          {langs.map((tag, i) => (
            <li key={tag} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
              <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{name(tag)}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={i === 0}
                aria-label={t('settings.general.up', { name: name(tag) })}
                onClick={() =>
                  setLangs([...langs.slice(0, i - 1), tag, langs[i - 1], ...langs.slice(i + 1)])
                }
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={langs.length <= 1}
                aria-label={t('settings.general.remove', { name: name(tag) })}
                onClick={() => setLangs(langs.filter((l) => l !== tag))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
        <Select value="" onValueChange={(v) => setLangs([...langs, v])}>
          <SelectTrigger aria-label={t('settings.general.add')}>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Plus className="size-4" />
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
