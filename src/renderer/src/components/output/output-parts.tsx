import { FileText, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@renderer/components/ui/checkbox'

/** A fieldset of native radios: one option with a label and a one-line hint. */
export function RadioChoice<T extends string>({
  legend,
  name,
  value,
  options,
  onChange
}: {
  legend: string
  name: string
  value: T
  options: readonly { value: T; label: string; hint: string }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-start gap-2.5 rounded-md border bg-background/30 px-3 py-2 text-sm has-[:checked]:border-primary/60 has-[:checked]:bg-accent/40"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-0.5 accent-(--primary)"
          />
          <span className="grid gap-0.5">
            <span className="font-medium">{o.label}</span>
            <span className="text-xs text-muted-foreground">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/** "Replace an existing file" instead of the default ` (2)` suffix. */
export function OverwriteOption({
  value,
  onChange
}: {
  value: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="grid gap-1">
      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox checked={value} onCheckedChange={(v) => onChange(v === true)} />
        {t('translate.output.overwrite')}
      </label>
      <p className="pl-6.5 text-xs text-muted-foreground">
        {value ? t('translate.output.overwriteOn') : t('translate.output.overwriteOff')}
      </p>
    </div>
  )
}

/** File name(s) the job will write and where. `example`: a batch shows the first file only. */
export function NamePreview({
  names,
  folder,
  example,
  warning
}: {
  names: readonly string[]
  folder: string
  example?: boolean
  warning?: string | null
}): React.JSX.Element | null {
  const { t } = useTranslation()
  if (!names.length) return null
  return (
    <section
      aria-label={t('translate.output.previewLabel')}
      className="grid min-w-0 gap-1.5 rounded-md border bg-background/30 px-3 py-2"
    >
      <span className="text-xs text-muted-foreground">
        {example
          ? t('translate.output.previewExample')
          : t('translate.output.preview', { count: names.length })}
      </span>
      <ul className="grid min-w-0 gap-0.5">
        {names.map((n) => (
          <li key={n} className="flex min-w-0 items-center gap-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 break-all font-mono">{n}</code>
          </li>
        ))}
      </ul>
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <FolderOpen className="size-3.5 shrink-0" />
        <span className="min-w-0 break-all" title={folder}>
          {folder}
        </span>
      </span>
      {warning ? <span className="text-xs text-warning">{warning}</span> : null}
    </section>
  )
}
