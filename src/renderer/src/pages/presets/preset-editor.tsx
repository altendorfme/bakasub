import { useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Preset } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'
import { Input, Textarea } from '@renderer/components/ui/input'
import { useDeletePreset, useDuplicatePreset, useSavePreset } from '@renderer/data/presets'
import { errorMessage } from '@renderer/i18n/error-message'
import { GlossaryEditor } from './glossary-editor'
import {
  draftOf,
  emptyDraft,
  isValid,
  MEDIA_TYPE_SUGGESTIONS,
  PRESET_LIMITS,
  toInput,
  validateDraft,
  type PresetDraft
} from './preset-draft'

/**
 * Edit a custom preset (or create one when `preset` is null); built-ins are shown read-only
 * with "Duplicate". The parent remounts it per preset (`key`), so the draft starts fresh.
 */
export function PresetEditor({
  preset,
  copiedFromName,
  onSaved,
  onDeleted
}: {
  preset: Preset | null
  copiedFromName?: string
  onSaved: (p: Preset) => void
  onDeleted: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const initial = preset ? draftOf(preset) : emptyDraft
  const [draft, setDraft] = useState<PresetDraft>(initial)
  const [touched, setTouched] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const save = useSavePreset()
  const duplicate = useDuplicatePreset()
  const remove = useDeletePreset()
  const readOnly = !!preset?.builtin
  const errors = validateDraft(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const show = (k: 'name' | 'mediaType' | 'temperature' | 'prompt'): string | undefined => {
    const code = touched ? errors[k] : undefined
    return code ? t(`presets.error.${code}`) : undefined
  }
  const set = (patch: Partial<PresetDraft>): void => setDraft((d) => ({ ...d, ...patch }))
  const fail = (err: unknown): void => void toast.error(errorMessage(err))

  const submit = (): void => {
    setTouched(true)
    if (!isValid(errors)) return
    save.mutate(
      { id: preset?.id ?? null, input: toInput(draft) },
      {
        onSuccess: (p) => {
          toast.success(t('presets.saved'))
          onSaved(p)
        },
        onError: fail
      }
    )
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{preset?.name ?? t('presets.new')}</h2>
        {readOnly ? <Badge>{t('presets.builtin')}</Badge> : null}
        {copiedFromName ? (
          <span className="text-xs text-muted-foreground">
            {t('presets.copiedFrom', { name: copiedFromName })}
          </span>
        ) : null}
        <span className="ml-auto flex gap-1">
          {preset ? (
            <Button
              type="button"
              size="sm"
              disabled={duplicate.isPending}
              onClick={() => duplicate.mutate(preset.id, { onSuccess: onSaved, onError: fail })}
            >
              <Copy />
              {t('presets.duplicate')}
            </Button>
          ) : null}
          {preset && !readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              {t('presets.delete')}
            </Button>
          ) : null}
        </span>
      </header>
      {readOnly ? <p className="text-sm text-muted-foreground">{t('presets.readOnly')}</p> : null}

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label={t('presets.field.name')} error={show('name')}>
          <Input
            value={draft.name}
            readOnly={readOnly}
            maxLength={PRESET_LIMITS.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label={t('presets.field.mediaType')} error={show('mediaType')}>
          <Input
            value={draft.mediaType}
            readOnly={readOnly}
            list="media-type-suggestions"
            maxLength={PRESET_LIMITS.mediaType}
            onChange={(e) => set({ mediaType: e.target.value })}
          />
        </Field>
        <Field label={t('presets.field.temperature')} error={show('temperature')}>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.05}
            value={draft.temperature}
            readOnly={readOnly}
            onChange={(e) => set({ temperature: e.target.value })}
          />
        </Field>
      </div>
      <datalist id="media-type-suggestions">
        {MEDIA_TYPE_SUGGESTIONS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <p className="-mt-2 text-xs text-muted-foreground">
        {t('presets.field.mediaTypeHint')} {t('presets.field.temperatureHint')}
      </p>

      <Field
        label={t('presets.field.prompt')}
        hint={t('presets.field.promptHint', {
          count: draft.prompt.length,
          max: PRESET_LIMITS.prompt
        })}
        error={show('prompt')}
      >
        <Textarea
          rows={6}
          value={draft.prompt}
          readOnly={readOnly}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </Field>

      <GlossaryEditor
        rows={draft.glossary}
        errors={touched ? errors.glossary : undefined}
        readOnly={readOnly}
        onChange={(glossary) => set({ glossary })}
      />

      {readOnly ? null : (
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          {dirty ? (
            <span className="mr-auto text-xs text-warning">{t('presets.unsaved')}</span>
          ) : null}
          {dirty && preset ? (
            <Button type="button" variant="ghost" onClick={() => setDraft(initial)}>
              {t('presets.discard')}
            </Button>
          ) : null}
          <Button type="submit" variant="default" disabled={save.isPending || (!dirty && !!preset)}>
            {t('presets.save')}
          </Button>
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={t('presets.deleteTitle', { name: preset?.name ?? '' })}
          description={t('presets.deleteBody')}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button">{t('actions.cancel')}</Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                preset &&
                remove.mutate(preset.id, {
                  onSuccess: () => {
                    setConfirmDelete(false)
                    onDeleted()
                  },
                  onError: (err) => {
                    setConfirmDelete(false)
                    fail(err)
                  }
                })
              }
            >
              {t('presets.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
