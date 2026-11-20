import { useState, type FormEvent } from 'react'
import { CheckCircle2, KeyRound, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { errorMessage } from '@renderer/i18n/error-message'

/**
 * Write-only secret: the saved key never comes back, so the form shows "saved" and offers to
 * replace or remove it. Used for the OpenRouter and TMDB keys (onboarding and Settings).
 */
export function KeyForm({
  label,
  present,
  noKeyring = false,
  placeholder,
  onSave,
  onRemove,
  saving,
  error,
  guide
}: {
  label: string
  present: boolean
  noKeyring?: boolean
  placeholder?: string
  /** Resolves when saved (the form clears); rejects with the error shown under the field. */
  onSave: (key: string) => Promise<unknown>
  onRemove?: () => void
  saving: boolean
  error: unknown
  guide?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)
  const showInput = !present || editing

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const key = value.trim()
    if (!key) return
    onSave(key).then(
      () => {
        setValue('')
        setEditing(false)
      },
      () => undefined
    )
  }

  return (
    <div className="grid gap-3">
      {present && !editing ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-background/40 px-3 py-2">
          <CheckCircle2 className="size-4 text-success" />
          <span className="text-sm">{t('keyForm.saved')}</span>
          <span className="ml-auto flex gap-1">
            <Button size="sm" onClick={() => setEditing(true)}>
              {t('keyForm.replace')}
            </Button>
            {onRemove ? (
              <Button size="sm" variant="destructive" onClick={onRemove}>
                {t('keyForm.remove')}
              </Button>
            ) : null}
          </span>
        </div>
      ) : null}
      {showInput ? (
        <form onSubmit={submit} className="grid gap-2">
          <Field label={label} error={error ? errorMessage(error) : undefined}>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="default" disabled={saving || !value.trim()}>
              <KeyRound />
              {saving ? t('keyForm.checking') : t('keyForm.save')}
            </Button>
            {editing ? (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t('actions.cancel')}
              </Button>
            ) : null}
            <span className="ml-auto">{guide}</span>
          </div>
        </form>
      ) : null}
      {present && noKeyring ? (
        <p className="flex gap-2 text-xs text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          {t('keyForm.noKeyring')}
        </p>
      ) : null}
    </div>
  )
}
