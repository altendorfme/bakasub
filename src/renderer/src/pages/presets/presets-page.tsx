import { useState } from 'react'
import { Download, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Preset } from '@shared/ipc-contract'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { useExportPresets, usePresets } from '@renderer/data/presets'
import { errorMessage } from '@renderer/i18n/error-message'
import { cn } from '@renderer/lib/utils'
import { ImportDialog } from './import-dialog'
import { PresetEditor } from './preset-editor'

const NEW = 'new'

/** Built-in and custom presets on the left, the selected one (or a new one) on the right. */
export function PresetsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const presets = usePresets().data ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const [marked, setMarked] = useState<string[]>([])
  const exp = useExportPresets()
  const builtins = presets.filter((p) => p.builtin)
  const custom = presets.filter((p) => !p.builtin)
  const current =
    selected === NEW ? null : (presets.find((p) => p.id === selected) ?? builtins[0] ?? null)
  const editing = selected === NEW ? NEW : current?.id

  const item = (p: Preset): React.JSX.Element => (
    <li key={p.id} className="flex items-center gap-2">
      <Checkbox
        aria-label={`${t('presets.select')}: ${p.name}`}
        checked={marked.includes(p.id)}
        onCheckedChange={(on) =>
          setMarked((m) => (on ? [...m, p.id] : m.filter((x) => x !== p.id)))
        }
      />
      <button
        type="button"
        aria-current={editing === p.id ? 'true' : undefined}
        onClick={() => setSelected(p.id)}
        className={cn(
          'flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm',
          editing === p.id ? 'bg-primary-soft/60 text-foreground' : 'hover:bg-accent'
        )}
      >
        <span className="truncate">{p.name}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.mediaType}</span>
      </button>
    </li>
  )

  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-6 py-7">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid flex-1 gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('pages.presets.title')}</h1>
          <p className="max-w-[65ch] text-sm text-muted-foreground">{t('presets.body')}</p>
        </div>
        <ImportDialog />
        <Button
          disabled={marked.length === 0 || exp.isPending}
          onClick={() =>
            exp.mutate(marked, {
              onSuccess: (r) => {
                if (r.path) toast.success(t('presets.exported', { count: r.count }))
              },
              onError: (err) => toast.error(errorMessage(err))
            })
          }
        >
          <Download />
          {t('presets.export', { count: marked.length })}
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-[16rem_1fr]">
        <aside className="grid content-start gap-4">
          <Button variant="default" onClick={() => setSelected(NEW)}>
            <Plus />
            {t('presets.new')}
          </Button>
          <section className="grid gap-1">
            <h2 className="px-2 text-xs text-muted-foreground">{t('presets.builtin')}</h2>
            <ul className="grid gap-0.5">{builtins.map(item)}</ul>
          </section>
          <section className="grid gap-1">
            <h2 className="px-2 text-xs text-muted-foreground">{t('presets.custom')}</h2>
            {custom.length ? (
              <ul className="grid gap-0.5">{custom.map(item)}</ul>
            ) : (
              <p className="px-2 text-xs text-muted-foreground">{t('presets.noCustom')}</p>
            )}
          </section>
        </aside>
        <section className="rounded-xl border bg-card/92 p-5">
          {selected === NEW || current ? (
            <PresetEditor
              key={editing}
              preset={current}
              copiedFromName={presets.find((p) => p.id === current?.copiedFrom)?.name}
              onSaved={(p) => setSelected(p.id)}
              onDeleted={() => {
                setMarked((m) => m.filter((x) => x !== current?.id))
                setSelected(null)
              }}
            />
          ) : null}
        </section>
      </div>
    </div>
  )
}
