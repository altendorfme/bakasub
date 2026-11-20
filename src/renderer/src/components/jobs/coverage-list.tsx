import { useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CoverageReport } from '@shared/ipc-contract'
import { Button } from '@renderer/components/ui/button'
import { formatTimecode as time } from '@renderer/lib/format'

/**
 * What will not go to the AI: `untranslated` lines are listed (the user should look at them);
 * `skipped` ones (nothing to translate) are only counted, with an opt-in list.
 */
export function CoverageList({ report }: { report: CoverageReport }): React.JSX.Element | null {
  const { t } = useTranslation()
  const [showSkipped, setShowSkipped] = useState(false)
  const { untranslated, skipped } = report.totals
  if (untranslated === 0 && skipped === 0) return null
  const entries = report.entries.filter((e) => showSkipped || e.status === 'untranslated')

  return (
    <section className="grid gap-2" aria-label={t('coverage.heading')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {untranslated > 0 ? (
          <span className="flex items-center gap-1.5 text-warning">
            <AlertTriangle className="size-4" />
            {t('coverage.summaryUntranslated', { count: untranslated })}
          </span>
        ) : null}
        {skipped > 0 ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Info className="size-4" />
            {t('coverage.summarySkipped', { count: skipped })}
          </span>
        ) : null}
        {skipped > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setShowSkipped(!showSkipped)}
          >
            {showSkipped ? t('coverage.hideSkipped') : t('coverage.showSkipped')}
          </Button>
        ) : null}
      </div>
      {entries.length > 0 ? (
        <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-md border bg-background/40 p-1.5">
          {entries.map((e, i) => (
            <li key={i} className="grid gap-0.5 rounded px-2 py-1.5 text-xs odd:bg-muted/40">
              <span className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                <span>{t('coverage.line', { line: e.location.line })}</span>
                {e.location.startMs !== undefined ? <span>{time(e.location.startMs)}</span> : null}
                <span className={e.severity === 'warn' ? 'text-warning' : ''}>
                  {t(`coverage.reason.${e.reason}`)}
                </span>
                <span className="ml-auto">
                  {e.outcome === 'omitted' ? t('coverage.omitted') : t('coverage.kept')}
                </span>
              </span>
              <code className="truncate font-mono text-foreground/90">{e.excerpt}</code>
            </li>
          ))}
        </ul>
      ) : null}
      {report.truncated ? (
        <p className="text-xs text-muted-foreground">{t('coverage.truncated')}</p>
      ) : null}
    </section>
  )
}
