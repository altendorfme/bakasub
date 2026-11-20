import { useTranslation } from 'react-i18next'
import { Badge } from '@renderer/components/ui/badge'
import { Field } from '@renderer/components/ui/field'
import { Textarea } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useModels } from '@renderer/data/models'
import { usePresets } from '@renderer/data/presets'
import { useSettings } from '@renderer/data/settings'
import { languageName } from '@renderer/lib/languages'
import { mediaTypeLabel, presetLabel } from '@renderer/lib/preset-labels'
import { NOTES_MAX } from './wizard-state'

/** `null` = the default from Settings (shown prefilled). */
export interface PresetChoice {
  presetId: string | null
  model: string | null
  targetLang: string | null
  notes: string
}

/**
 * Preset (with its details), model (favorites only) and language, prefilled from the defaults.
 * Used by the single-file wizard and by the batch wizard (whose preset is per work, so it
 * passes `withPreset={false}` and shows a `PresetPicker` of its own).
 */
export function PresetStep({
  value: state,
  onChange,
  notesLabel,
  withPreset = true,
  presetHint
}: {
  value: Omit<PresetChoice, 'presetId'> & { presetId?: string | null }
  onChange: (patch: Partial<PresetChoice>) => void
  notesLabel?: string
  withPreset?: boolean
  /** Under the preset select (e.g. where the preset came from). */
  presetHint?: React.ReactNode
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const settings = useSettings().data
  const catalog = useModels().data?.models ?? []

  const model = state.model ?? settings?.['translation.defaultModel'] ?? ''
  const lang = state.targetLang ?? settings?.['translation.defaultTargetLang'] ?? ''
  const favorites = settings?.['models.favorites'] ?? []
  const nameOf = (id: string): string => catalog.find((m) => m.id === id)?.name ?? id

  return (
    <div className="grid gap-4">
      {withPreset ? (
        <PresetPicker
          value={state.presetId ?? null}
          onChange={(presetId) => onChange({ presetId })}
          hint={presetHint}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('translate.preset.model')}
          hint={t('translate.preset.modelHint')}
          help={t('help.model')}
        >
          <Select value={model} onValueChange={(v) => onChange({ model: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {favorites.map((id) => (
                <SelectItem key={id} value={id}>
                  {nameOf(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={t('translate.preset.language')}
          hint={t('translate.preset.languageHint')}
          help={t('help.language')}
        >
          <Select value={lang} onValueChange={(v) => onChange({ targetLang: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(settings?.['translation.targetLangs'] ?? []).map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {languageName(tag, i18n.language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        label={notesLabel ?? t('translate.preset.notes')}
        help={t('help.notes')}
        hint={t('translate.preset.notesHint', { count: state.notes.length, max: NOTES_MAX })}
        error={
          state.notes.length > NOTES_MAX
            ? t('translate.preset.notesHint', { count: state.notes.length, max: NOTES_MAX })
            : undefined
        }
      >
        <Textarea
          rows={4}
          value={state.notes}
          placeholder={t('translate.preset.notesPlaceholder')}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </Field>
    </div>
  )
}

/** Preset select (names only) and the chosen preset's details. `null` = default from Settings. */
export function PresetPicker({
  value,
  onChange,
  hint,
  label
}: {
  value: string | null
  onChange: (presetId: string) => void
  hint?: React.ReactNode
  label?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const settings = useSettings().data
  const presets = usePresets().data ?? []
  const presetId = value ?? settings?.['translation.defaultPresetId'] ?? ''
  const preset = presets.find((p) => p.id === presetId)
  return (
    <div className="grid gap-2">
      <Field label={label ?? t('translate.preset.preset')} help={t('help.preset')} hint={hint}>
        <Select value={presetId} onValueChange={onChange}>
          <SelectTrigger>
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
      </Field>
      {preset ? (
        <dl className="grid gap-x-6 gap-y-1 rounded-md border bg-background/40 p-3 text-xs sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">{t('translate.preset.mediaType')}</dt>
          <dd className="flex gap-2">
            {mediaTypeLabel(preset.mediaType, t)}
            {preset.builtin ? <Badge>{t('translate.preset.builtin')}</Badge> : null}
          </dd>
          <dt className="text-muted-foreground">{t('translate.preset.temperature')}</dt>
          <dd>{preset.temperature}</dd>
          <dt className="text-muted-foreground">{t('translate.preset.style')}</dt>
          <dd className="line-clamp-3 whitespace-pre-line">{preset.prompt || '—'}</dd>
          <dt className="sr-only">{t('translate.preset.noGlossary')}</dt>
          <dd className="text-muted-foreground sm:col-span-2">
            {preset.glossary.length
              ? t('translate.preset.glossary', { count: preset.glossary.length })
              : t('translate.preset.noGlossary')}
          </dd>
        </dl>
      ) : null}
    </div>
  )
}
