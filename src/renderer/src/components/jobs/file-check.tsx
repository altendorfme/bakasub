import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Info, OctagonAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  CoverageReport,
  DetectedEncoding,
  DiagnosticSeverity,
  ParserDiagnostic,
  SubtitleInspection
} from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { useInspectSubtitle } from '@renderer/data/media'
import { errorMessage } from '@renderer/i18n/error-message'
import { cn } from '@renderer/lib/utils'

const CONFIDENCE_TONE = {
  certain: 'success',
  high: 'success',
  medium: 'warning',
  low: 'destructive'
} as const

const SEVERITY_STYLE: Record<DiagnosticSeverity, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-muted-foreground' },
  warn: { icon: AlertTriangle, className: 'text-warning' },
  error: { icon: OctagonAlert, className: 'text-destructive' }
}

/** Detected encoding with its confidence; a low or medium one gets a visible warning. */
export function EncodingIndicator({ encoding }: { encoding: DetectedEncoding }): React.JSX.Element {
  const { t } = useTranslation()
  const name = encoding.name.toUpperCase()
  const score = encoding.score === null ? '' : encoding.score.toFixed(2)
  const warn =
    encoding.confidence === 'low'
      ? t('fileCheck.lowWarn', { name, score })
      : encoding.confidence === 'medium'
        ? t('fileCheck.medWarn', { name })
        : null
  return (
    <div className="grid gap-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">{t('fileCheck.encHeading')}:</span>
        <span className="font-medium">{name}</span>
        <Badge tone={CONFIDENCE_TONE[encoding.confidence]}>
          {t(`fileCheck.conf.${encoding.confidence}`)}
        </Badge>
        {encoding.bom ? <Badge>{t('fileCheck.bom')}</Badge> : null}
        <span className="text-xs text-muted-foreground">{t(`fileCheck.eol.${encoding.eol}`)}</span>
      </p>
      {warn ? (
        <p
          role="alert"
          className={cn(
            'flex gap-2 rounded-md border p-3 text-sm',
            encoding.confidence === 'low'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-warning/40 bg-warning/10 text-warning'
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {warn}
        </p>
      ) : null}
    </div>
  )
}

/** Translatable vs skipped vs untranslated lines, as numbers and a proportional bar. */
export function CoverageSummary({ report }: { report: CoverageReport }): React.JSX.Element | null {
  const { t } = useTranslation()
  const { translatable, skipped, untranslated } = report.totals
  const total = translatable + skipped + untranslated
  if (total === 0) return null
  const pct = (n: number): string => `${(n / total) * 100}%`
  return (
    <section className="grid gap-1.5" aria-label={t('fileCheck.covHeading')}>
      <p className="text-sm">{t('fileCheck.covBar', { translatable, total })}</p>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-success" style={{ width: pct(translatable) }} />
        <div className="bg-muted-foreground/40" style={{ width: pct(skipped) }} />
        <div className="bg-warning" style={{ width: pct(untranslated) }} />
      </div>
      <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span>{t('fileCheck.covTranslatable', { count: translatable })}</span>
        <span>{t('fileCheck.covSkipped', { count: skipped })}</span>
        <span className={untranslated > 0 ? 'text-warning' : ''}>
          {t('fileCheck.covUntranslated', { count: untranslated })}
        </span>
      </p>
    </section>
  )
}

function DiagnosticRow({ d }: { d: ParserDiagnostic }): React.JSX.Element {
  const { t } = useTranslation()
  const { icon: Icon, className } = SEVERITY_STYLE[d.severity]
  const message = t(`fileCheck.code.${d.code}`, {
    defaultValue: t('fileCheck.unknown', { code: d.code })
  })
  return (
    <li className="flex items-start gap-2 rounded px-2 py-1.5 text-xs odd:bg-muted/40">
      <Icon className={cn('mt-0.5 size-3.5 shrink-0', className)} aria-hidden />
      <span className="sr-only">{t(`fileCheck.sev.${d.severity}`)}</span>
      <span className="grid gap-0.5">
        <span className="text-foreground/90">{message}</span>
        <span className="text-muted-foreground">
          {t('coverage.line', { line: d.line })} · {t('fileCheck.col', { column: d.column })} ·{' '}
          {d.fix === 'auto' ? t('fileCheck.fixAuto') : t('fileCheck.fixReport')}
        </span>
      </span>
    </li>
  )
}

/** Collapsible list of the parser's diagnostics (severity, line, message). */
export function DiagnosticsList({
  diagnostics
}: {
  diagnostics: SubtitleInspection['diagnostics']
}): React.JSX.Element {
  const { t } = useTranslation()
  const { totals, items, truncated } = diagnostics
  const total = totals.error + totals.warn + totals.info
  const [open, setOpen] = useState(false)
  if (total === 0) return <p className="text-sm text-muted-foreground">{t('fileCheck.diagNone')}</p>
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <section className="grid gap-2" aria-label={t('fileCheck.diagHeading')}>
      <Button
        size="sm"
        variant="ghost"
        className="w-fit justify-start px-1"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Chevron className="size-4" />
        <span className="font-medium">{t('fileCheck.diagHeading')}</span>
        <span className={cn('text-xs', totals.error > 0 ? 'text-destructive' : 'text-warning')}>
          {t('fileCheck.diagSummary', {
            errors: totals.error,
            warns: totals.warn,
            infos: totals.info
          })}
        </span>
      </Button>
      {open ? (
        <>
          <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-md border bg-background/40 p-1.5">
            {items.map((d, i) => (
              <DiagnosticRow key={i} d={d} />
            ))}
          </ul>
          {truncated ? (
            <p className="text-xs text-muted-foreground">
              {t('fileCheck.truncated', { count: items.length })}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

/** Encoding + parser warnings of a subtitle file, inspected on demand (never blocks the flow). */
export function FileCheck({ path }: { path: string }): React.JSX.Element | null {
  const { t } = useTranslation()
  const query = useInspectSubtitle(path)
  if (query.isPending)
    return <p className="text-xs text-muted-foreground">{t('fileCheck.loading')}</p>
  if (query.isError)
    return (
      <p className="text-xs text-muted-foreground">
        {t('fileCheck.failed', { message: errorMessage(query.error) })}
      </p>
    )
  return (
    <section
      className="grid gap-3 rounded-lg border bg-background/40 p-3"
      aria-label={t('fileCheck.heading')}
    >
      <EncodingIndicator encoding={query.data.encoding} />
      <DiagnosticsList diagnostics={query.data.diagnostics} />
    </section>
  )
}
