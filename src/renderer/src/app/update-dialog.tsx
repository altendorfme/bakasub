import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppUpdateStatus } from '@shared/ipc-contract'
import { ReleaseNotes } from '@renderer/components/common/release-notes'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@renderer/components/ui/dialog'
import { useAppUpdateStatus } from '@renderer/data/app'
import { formatBytes, formatDate } from '@renderer/lib/format'
import type { AppRouter } from './router'

type Available = AppUpdateStatus & { state: 'available'; latest: string }

const isAvailable = (s: AppUpdateStatus | undefined): s is Available =>
  s?.state === 'available' && !!s.latest

/**
 * Opens once per version (per session) when the updater reports `available`: the startup check
 * (gated by `updates.autoCheck` in the Main) or any later check. It only informs and points to
 * Settings → About; nothing is downloaded or installed from here. Esc, the overlay and the close
 * button all count as "Later", which holds until the next app start (the seen set lives in memory).
 */
export function UpdateDialog({ router }: { router: AppRouter }): React.JSX.Element | null {
  const { t, i18n } = useTranslation()
  const status = useAppUpdateStatus().data
  const seen = useRef(new Set<string>())
  const [shown, setShown] = useState<Available | null>(null)
  const [open, setOpen] = useState(false)

  const latest = isAvailable(status) ? status.latest : undefined
  useEffect(() => {
    if (!latest || !isAvailable(status) || seen.current.has(latest)) return
    seen.current.add(latest)
    // Snapshot: the dialog keeps describing the version it announced even if the state moves on.
    setShown(status)
    setOpen(true)
  }, [latest, status])

  if (!shown) return null

  const goToAbout = (): void => {
    setOpen(false)
    void router.navigate({ to: '/settings', search: { tab: 'about' } })
  }
  const published = shown.publishedAt && !Number.isNaN(Date.parse(shown.publishedAt))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title={t('settings.about.dialogTitle')}
        description={t('settings.about.dialogHint')}
      >
        <div className="grid gap-1 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <span className="sr-only">
              {t('settings.about.dialogVersions', {
                current: shown.current,
                latest: shown.latest
              })}
            </span>
            <span aria-hidden className="text-muted-foreground">
              {shown.current}
            </span>
            <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
            <span aria-hidden className="text-primary">
              {shown.latest}
            </span>
          </p>
          {published || shown.size ? (
            <p className="text-xs text-muted-foreground">
              {[
                published
                  ? t('settings.about.dialogPublished', {
                      date: formatDate(shown.publishedAt!, i18n.language)
                    })
                  : null,
                shown.size
                  ? t('settings.about.dialogSize', {
                      size: formatBytes(shown.size, i18n.language)
                    })
                  : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
        {shown.notes ? (
          <section aria-label={t('settings.about.dialogNotes')} className="grid gap-1.5">
            <h3 className="text-xs font-semibold">{t('settings.about.dialogNotes')}</h3>
            <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-3">
              <ReleaseNotes html={shown.notes} />
            </div>
          </section>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('settings.about.dialogLater')}
          </Button>
          <Button variant="default" onClick={goToAbout}>
            {t('settings.about.dialogUpdate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
