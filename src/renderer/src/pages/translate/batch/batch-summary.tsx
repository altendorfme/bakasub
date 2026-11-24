import { useTranslation } from 'react-i18next'
import type { BatchSource } from '@shared/ipc-contract'
import { useOutputPrefs } from '@renderer/data/output-prefs'
import { SummaryList } from '../summary-list'
import type { SummaryRow } from '../summary-rows'
import type { BatchCtx } from './batch-ctx'
import type { BatchStep } from './batch-state'
import { useSettingsLabels } from './use-settings-labels'
import { rowsOf, workPreset } from './works'

/** Same rules as the single-file summary: a row per choice of a reached step, linking to it. */
export function BatchSummary({
  source,
  ctx,
  steps,
  furthest,
  current,
  canGo,
  onGo
}: {
  source: BatchSource | null
  ctx: BatchCtx | null
  steps: readonly BatchStep[]
  /** Index of the furthest step reached. */
  furthest: number
  current: BatchStep
  canGo: (s: BatchStep) => boolean
  onGo: (s: BatchStep) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const label = useSettingsLabels()
  const none = t('batch.summary.none')
  const prefs = useOutputPrefs()
  const o = ctx?.options
  const included = ctx?.rows.filter((r) => r.include).length ?? 0
  const out = (ctx?.rows.length ?? 0) - included
  const attention = ctx?.rows.filter((r, i) => r.include && ctx.problems[i]).length ?? 0
  const customized = ctx?.grouping.works.filter((w) => w.custom).length ?? 0
  // One preset per work: the distinct ones, in work order.
  const presets = ctx
    ? [
        ...new Set(
          ctx.grouping.works
            .filter((w) => rowsOf(ctx.grouping, ctx.rows, w.id).some((i) => ctx.rows[i].include))
            .map((w) => label.preset(workPreset(w, ctx.suggestions)))
            .filter((p) => p !== none)
        )
      ].join(', ')
    : ''
  // The labels fall back to `none` when even Settings has no value: such a row is left out.
  const known = (v: string): string | null => (v === none ? null : v)
  const model = known(label.model(o?.model ?? null))

  const rows: SummaryRow<BatchStep>[] = [
    {
      step: 'files',
      label: t('batch.summary.source'),
      value:
        source?.type === 'folder'
          ? source.path
          : source
            ? t('batch.files.fromFiles', { count: source.paths.length })
            : null
    },
    {
      step: 'files',
      label: t('batch.summary.files'),
      value: ctx
        ? out
          ? t('batch.summary.includedOut', { count: included, out })
          : t('batch.summary.included', { count: included })
        : null,
      ...(attention ? { warn: t('batch.status.attention', { count: attention }) } : {})
    },
    {
      step: 'tracks',
      label: t('batch.summary.tracks'),
      value: ctx ? t('batch.summary.tracksValue') : null
    },
    {
      step: 'works',
      label: t('batch.summary.works'),
      value: ctx?.grouping.works.map((w) => w.name).join(', ') || null
    },
    {
      step: 'preset',
      label: t('batch.summary.preset'),
      value: presets || null
    },
    {
      step: 'preset',
      label: t('batch.summary.model'),
      value:
        model && customized
          ? t('batch.summary.customized', { preset: model, count: customized })
          : model
    },
    {
      step: 'preset',
      label: t('batch.summary.language'),
      value: known(label.lang(o?.targetLang ?? null))
    },
    ...(ctx?.flavor === 'pipeline'
      ? [
          {
            step: 'output' as const,
            label: t('batch.summary.write'),
            value: t(`translate.output.mode.${o?.outputMode ?? prefs.mode}`)
          }
        ]
      : []),
    {
      step: 'output',
      label: t('batch.summary.output'),
      value: o?.outputDir ?? t('batch.summary.nextToEach')
    }
  ]

  return (
    <SummaryList
      id="batch-summary"
      title={t('batch.summary.title')}
      empty={t('batch.summary.empty')}
      rows={rows}
      steps={steps}
      furthest={furthest}
      current={current}
      stepLabel={(s) => t(`batch.steps.${s}`)}
      canGo={canGo}
      onGo={onGo}
    />
  )
}
