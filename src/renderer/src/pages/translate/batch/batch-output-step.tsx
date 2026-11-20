import { useTranslation } from 'react-i18next'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { useOutputPrefs } from '@renderer/data/output-prefs'
import { useSettings } from '@renderer/data/settings'
import { outputFolder, translateOutputNames } from '@renderer/lib/output-names'
import { episodeCode } from '@renderer/lib/episode'
import { OutputStep } from '../output-step'
import type { BatchCtx } from './batch-ctx'
import { Issues, KindBadge } from './batch-parts'
import { defaultSettings } from './batch-state'
import { effectiveSettings, rowsOf, workPreset } from './works'
import { useSettingsLabels } from './use-settings-labels'

/** Output folder and mux options (shared by the batch), the cost confirmation, then a review. */
export function BatchOutputStep({ ctx }: { ctx: BatchCtx }): React.JSX.Element {
  const { t } = useTranslation()
  const label = useSettingsLabels()
  const o = ctx.options
  const prefs = useOutputPrefs()
  const defaultLang = useSettings().data?.['translation.defaultTargetLang'] ?? null
  const video = ctx.flavor === 'pipeline'
  const mode = o.outputMode ?? prefs.mode
  // Preview of the first included file: the rest follow the same rule.
  const first = ctx.rows.find((r) => r.include)
  const lang = o.targetLang ?? defaultLang
  const track = first?.item.tracks?.find((x) => x.id === first.trackId)
  const preview =
    first && lang
      ? {
          names: translateOutputNames(
            first.item.path,
            lang,
            video ? (track?.format ?? 'srt') : (first.item.path.split('.').pop() ?? 'srt'),
            video ? mode : 'subtitle'
          ),
          folder: outputFolder(first.item.path, o.outputDir),
          example: true
        }
      : null
  return (
    <>
      <OutputStep
        video={video}
        outputDir={o.outputDir}
        mode={mode}
        mux={o.mux}
        overwrite={o.overwrite}
        preview={preview}
        onFolder={(outputDir) => ctx.setOptions({ outputDir })}
        onMode={(outputMode) => ctx.setOptions({ outputMode })}
        onOverwrite={(overwrite) => ctx.setOptions({ overwrite })}
        onMux={(patch) => ctx.setOptions({ mux: { ...o.mux, ...patch } })}
        summary={
          ctx.plan.root && o.outputDir ? (
            <p className="text-xs text-muted-foreground">
              {t('batch.output.mirror', { root: ctx.plan.root })}
            </p>
          ) : null
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
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

      <section
        aria-labelledby="batch-review"
        className="grid grid-cols-[minmax(0,1fr)] gap-2 border-t pt-4"
      >
        <h3 id="batch-review" className="text-sm font-semibold">
          {t('batch.output.review')}
        </h3>
        <Issues ctx={ctx} />
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
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
                className="grid grid-cols-[minmax(0,1fr)] gap-0.5 rounded-md border bg-background/30 px-3 py-2 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {w.name}
                  <KindBadge work={w} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    t('batch.works.files', { count: idx.length }),
                    eps.length ? `${eps[0]}–${eps[eps.length - 1]}` : null,
                    label.preset(workPreset(w, ctx.suggestions)),
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
