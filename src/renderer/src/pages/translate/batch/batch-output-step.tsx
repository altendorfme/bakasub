import { useTranslation } from 'react-i18next'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { episodeCode } from '@renderer/lib/episode'
import { OutputStep } from '../output-step'
import type { BatchCtx } from './batch-ctx'
import { Issues, KindBadge } from './batch-parts'
import { defaultSettings } from './batch-state'
import { effectiveSettings, rowsOf } from './works'
import { useSettingsLabels } from './use-settings-labels'

/** Output folder and mux options (shared by the batch), the cost confirmation, then a review. */
export function BatchOutputStep({ ctx }: { ctx: BatchCtx }): React.JSX.Element {
  const { t } = useTranslation()
  const label = useSettingsLabels()
  const o = ctx.options
  return (
    <>
      <OutputStep
        video={ctx.flavor === 'pipeline'}
        outputDir={o.outputDir}
        mux={o.mux}
        onFolder={(outputDir) => ctx.setOptions({ outputDir })}
        onMux={(patch) => ctx.setOptions({ mux: { ...o.mux, ...patch } })}
        summary={
          ctx.plan.root && o.outputDir ? (
            <p className="text-xs text-muted-foreground">
              {t('batch.output.mirror', { root: ctx.plan.root })}
            </p>
          ) : null
        }
      />
      <div className="grid gap-1">
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox
            checked={o.confirmBeforeTranslate}
            onCheckedChange={(v) => ctx.setOptions({ confirmBeforeTranslate: v === true })}
          />
          {t('batch.output.confirm')}
        </label>
        {!o.confirmBeforeTranslate ? (
          <p className="pl-6.5 text-xs text-muted-foreground">{t('batch.output.confirmOff')}</p>
        ) : null}
      </div>

      <section aria-labelledby="batch-review" className="grid gap-2 border-t pt-4">
        <h3 id="batch-review" className="text-sm font-semibold">
          {t('batch.output.review')}
        </h3>
        <Issues ctx={ctx} />
        <ul className="grid gap-1.5">
          {ctx.grouping.works.map((w) => {
            const idx = rowsOf(ctx.grouping, ctx.rows, w.id).filter((i) => ctx.rows[i].include)
            if (!idx.length) return null
            const s = effectiveSettings(w, defaultSettings(o))
            const eps = idx.flatMap((i) => {
              const r = ctx.rows[i]
              return w.ref?.kind === 'series' && r.season !== null && r.episode !== null
                ? [episodeCode(r.season, r.episode)]
                : []
            })
            return (
              <li
                key={w.id}
                className="grid gap-0.5 rounded-md border bg-background/30 px-3 py-2 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {w.name}
                  <KindBadge work={w} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    t('batch.works.files', { count: idx.length }),
                    eps.length ? `${eps[0]}–${eps[eps.length - 1]}` : null,
                    label.preset(s.presetId),
                    label.model(s.model),
                    label.lang(s.targetLang)
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
