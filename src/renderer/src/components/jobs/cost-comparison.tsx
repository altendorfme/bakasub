import { AlertTriangle, CheckCircle2, Coins, Info, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { JobResult, JobStatus, PreflightEstimate } from '@shared/ipc-contract'
import { formatUsd } from '@renderer/lib/format'
import { costVerdict, type CostVerdict } from './cost-verdict'

/**
 * Result screen: what the preflight estimated next to what was actually billed, and whether it
 * landed inside the range. Both values come from `job.result` (persisted), so it survives restarts.
 */
export function CostComparison({
  estimate: e,
  usage,
  status
}: {
  estimate: PreflightEstimate
  usage: JobResult['usage']
  status: JobStatus
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const v = costVerdict(e, usage, status)
  const actual = usage?.cost ?? 0
  const pct = (n: number): string =>
    new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0
    }).format(Math.abs(n))

  return (
    <section className="grid gap-2" aria-label={t('jobs.costCompare.heading')}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Coins className="size-3.5" />
        {t('jobs.costCompare.heading')}
      </p>
      <dl className="grid grid-cols-2 gap-2">
        <div className="grid gap-0.5 rounded-lg border bg-background/40 p-3">
          <dt className="text-xs text-muted-foreground">{t('jobs.costCompare.estimated')}</dt>
          <dd className="text-sm font-semibold">
            {v.kind === 'free'
              ? t('preflight.free')
              : e.cost
                ? t('preflight.costRange', {
                    low: formatUsd(e.cost.low),
                    high: formatUsd(e.cost.high)
                  })
                : t('jobs.costCompare.notEstimated')}
          </dd>
        </div>
        <div className="grid gap-0.5 rounded-lg border bg-background/40 p-3">
          <dt className="text-xs text-muted-foreground">{t('jobs.costCompare.actual')}</dt>
          <dd className="text-sm font-semibold">
            {usage?.costIncomplete
              ? t('jobs.costCompare.actualPartial', { value: formatUsd(actual) })
              : `US$ ${formatUsd(actual)}`}
          </dd>
          {!usage || usage.requests === 0 ? (
            <dd className="text-xs text-muted-foreground">{t('jobs.costCompare.nothingSent')}</dd>
          ) : null}
        </div>
      </dl>
      <Verdict v={v} pct={pct} />
      {e.memory === 'skip' ? (
        <p className="text-xs text-muted-foreground">{t('jobs.costCompare.cacheSkipped')}</p>
      ) : e.lines.cached > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('jobs.costCompare.cached', { count: e.lines.cached })}
        </p>
      ) : null}
      {e.approximate && 'deviation' in v ? (
        <p className="text-xs text-muted-foreground">{t('jobs.costCompare.approximate')}</p>
      ) : null}
    </section>
  )
}

function Verdict({ v, pct }: { v: CostVerdict; pct: (n: number) => string }): React.JSX.Element {
  const { t } = useTranslation()
  switch (v.kind) {
    case 'within':
      return (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          {t('jobs.costCompare.within')}
        </p>
      )
    case 'below':
      return (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <TrendingDown className="size-4 shrink-0" />
          {v.deviation === null
            ? t('jobs.costCompare.belowNoPct')
            : t('jobs.costCompare.below', { pct: pct(v.deviation) })}
        </p>
      )
    case 'above':
      return (
        <p className="flex items-center gap-1.5 text-sm text-warning">
          <TrendingUp className="size-4 shrink-0" />
          {v.deviation === null
            ? t('jobs.costCompare.aboveNoPct')
            : t('jobs.costCompare.above', { pct: pct(v.deviation) })}
        </p>
      )
    case 'partial':
      return (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          {t('jobs.costCompare.partial')}
        </p>
      )
    case 'free':
    case 'unavailable':
    case 'unfinished':
      return (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          {t(`jobs.costCompare.${v.kind}`)}
        </p>
      )
  }
}
