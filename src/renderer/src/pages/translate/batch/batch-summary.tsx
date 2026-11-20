import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BatchSource } from '@shared/ipc-contract'
import { cn } from '@renderer/lib/utils'
import type { BatchCtx } from './batch-ctx'
import type { BatchStep } from './batch-state'
import { useSettingsLabels } from './use-settings-labels'

/** Same look as the single-file summary: one row per choice, linking to its step. */
export function BatchSummary({
  source,
  ctx,
  steps,
  current,
  canGo,
  onGo
}: {
  source: BatchSource | null
  ctx: BatchCtx | null
  steps: readonly BatchStep[]
  current: BatchStep
  canGo: (s: BatchStep) => boolean
  onGo: (s: BatchStep) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const label = useSettingsLabels()
  const none = t('batch.summary.none')
  const o = ctx?.options
  const included = ctx?.rows.filter((r) => r.include).length ?? 0
  const out = (ctx?.rows.length ?? 0) - included
  const attention = ctx?.rows.filter((r, i) => r.include && ctx.problems[i]).length ?? 0
  const customized = ctx?.grouping.works.filter((w) => w.custom).length ?? 0

  const rows: { step: BatchStep; label: string; value: string; warn?: string }[] = [
    {
      step: 'files',
      label: t('batch.summary.source'),
      value:
        source?.type === 'folder'
          ? source.path
          : source
            ? t('batch.files.fromFiles', { count: source.paths.length })
            : none
    },
    {
      step: 'files',
      label: t('batch.summary.files'),
      value: ctx
        ? out
          ? t('batch.summary.includedOut', { count: included, out })
          : t('batch.summary.included', { count: included })
        : none,
      ...(attention ? { warn: t('batch.status.attention', { count: attention }) } : {})
    },
    {
      step: 'tracks',
      label: t('batch.summary.tracks'),
      value: ctx ? t('batch.summary.tracksValue') : none
    },
    {
      step: 'works',
      label: t('batch.summary.works'),
      value: ctx?.grouping.works.map((w) => w.name).join(', ') || none
    },
    {
      step: 'preset',
      label: t('batch.summary.preset'),
      value: customized
        ? t('batch.summary.customized', {
            preset: label.preset(o?.presetId ?? null),
            count: customized
          })
        : label.preset(o?.presetId ?? null)
    },
    { step: 'preset', label: t('batch.summary.model'), value: label.model(o?.model ?? null) },
    {
      step: 'preset',
      label: t('batch.summary.language'),
      value: label.lang(o?.targetLang ?? null)
    },
    {
      step: 'output',
      label: t('batch.summary.output'),
      value: o?.outputDir ?? t('batch.summary.nextToEach')
    }
  ]

  return (
    <aside
      aria-labelledby="batch-summary"
      className="grid content-start gap-3 rounded-xl border bg-card/92 p-4 lg:sticky lg:top-6"
    >
      <h2 id="batch-summary" className="text-sm font-semibold">
        {t('batch.summary.title')}
      </h2>
      <ul className="grid gap-1">
        {rows
          .filter((r) => steps.includes(r.step))
          .map((r) => {
            const go = canGo(r.step)
            return (
              <li key={r.label}>
                <button
                  type="button"
                  disabled={!go}
                  onClick={() => onGo(r.step)}
                  aria-label={`${r.label}: ${r.value}. ${t('translate.summary.edit', { step: t(`batch.steps.${r.step}`) })}`}
                  className={cn(
                    'grid w-full gap-0.5 rounded-md px-2 py-1.5 text-left disabled:cursor-default',
                    go && 'hover:bg-accent',
                    current === r.step && 'bg-accent/60'
                  )}
                >
                  <span className="text-[11px] text-muted-foreground">{r.label}</span>
                  <span
                    className={cn('truncate text-sm', r.value === none && 'text-muted-foreground')}
                    title={r.value}
                  >
                    {r.value}
                  </span>
                  {r.warn ? (
                    <span className="flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {r.warn}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
      </ul>
    </aside>
  )
}
