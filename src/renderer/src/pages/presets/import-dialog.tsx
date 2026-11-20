import { useState } from 'react'
import { Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { PresetImportResult } from '@shared/ipc-contract'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger
} from '@renderer/components/ui/dialog'
import { useImportPresets } from '@renderer/data/presets'
import { errorMessage } from '@renderer/i18n/error-message'

/** Name-conflict policy, then the native file dialog, then what was imported and what was not. */
export function ImportDialog(): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [policy, setPolicy] = useState<'rename' | 'skip'>('rename')
  const [result, setResult] = useState<PresetImportResult | null>(null)
  const run = useImportPresets()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setResult(null)
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload />
          {t('presets.import')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t('presets.importDialog.title')}
        description={t('presets.importDialog.body')}
      >
        {result ? (
          <div className="grid gap-2 text-sm">
            <p>{t('presets.importDialog.imported', { count: result.imported.length })}</p>
            {result.imported.length ? (
              <ul className="grid list-disc gap-0.5 pl-5 text-xs text-muted-foreground">
                {result.imported.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            ) : null}
            {result.skipped.length ? (
              <>
                <p className="text-warning">{t('presets.importDialog.skipped')}</p>
                <ul className="grid gap-0.5 text-xs">
                  {result.skipped.map((s) => (
                    <li key={s.index}>
                      {s.name ?? t('presets.importDialog.entry', { n: s.index + 1 })}:{' '}
                      <span className="text-muted-foreground">
                        {s.reason === 'name-taken' ? t('presets.importDialog.nameTaken') : s.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : (
          <fieldset className="grid gap-2 text-sm">
            <legend className="mb-1 text-xs text-muted-foreground">
              {t('presets.importDialog.conflict')}
            </legend>
            {(['rename', 'skip'] as const).map((p) => (
              <label key={p} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="conflict"
                  checked={policy === p}
                  onChange={() => setPolicy(p)}
                  className="accent-(--primary)"
                />
                {t(`presets.importDialog.${p}`)}
              </label>
            ))}
          </fieldset>
        )}
        <DialogFooter>
          {result ? (
            <DialogClose asChild>
              <Button variant="default">{t('presets.importDialog.done')}</Button>
            </DialogClose>
          ) : (
            <Button
              variant="default"
              disabled={run.isPending}
              onClick={() =>
                run.mutate(policy, {
                  // `path: null`: the user cancelled the file dialog.
                  onSuccess: (r) => (r.path === null ? undefined : setResult(r)),
                  onError: (err) => toast.error(errorMessage(err))
                })
              }
            >
              {t('presets.importDialog.choose')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
