import { useTranslation } from 'react-i18next'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { PresetStep } from '../preset-step'
import type { BatchCtx } from './batch-ctx'
import { Collapsible, KindBadge } from './batch-parts'
import { defaultSettings } from './batch-state'
import { useSettingsLabels } from './use-settings-labels'
import { effectiveSettings, patchWork, rowsOf, type Work, type WorkSettings } from './works'

/** The batch defaults, then one card per work: defaults or its own settings, and its media. */
export function SettingsStep({ ctx }: { ctx: BatchCtx }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">{t('batch.preset.body')}</p>
      <Collapsible
        title={t('batch.preset.defaults')}
        summary={t('batch.preset.defaultsHint')}
        defaultOpen
      >
        <PresetStep value={ctx.options} onChange={ctx.setOptions} />
      </Collapsible>
      {ctx.grouping.works.map((w) =>
        rowsOf(ctx.grouping, ctx.rows, w.id).some((i) => ctx.rows[i].include) ? (
          <WorkSettingsCard key={w.id} ctx={ctx} work={w} />
        ) : null
      )}
    </>
  )
}

function WorkSettingsCard({ ctx, work: w }: { ctx: BatchCtx; work: Work }): React.JSX.Element {
  const { t } = useTranslation()
  const label = useSettingsLabels()
  const s = effectiveSettings(w, defaultSettings(ctx.options))
  const n = rowsOf(ctx.grouping, ctx.rows, w.id).filter((i) => ctx.rows[i].include).length
  const set = (patch: Partial<WorkSettings>): void =>
    ctx.setGrouping(patchWork(ctx.grouping, w.id, { custom: { ...s, ...patch } }))
  return (
    <Collapsible
      title={w.name}
      badge={
        <>
          <KindBadge work={w} />
          {w.custom ? (
            <Badge tone="primary">{t('batch.preset.customized')}</Badge>
          ) : (
            <Badge>{t('batch.preset.usesDefaults')}</Badge>
          )}
        </>
      }
      summary={[
        t('batch.works.files', { count: n }),
        label.preset(s.presetId),
        label.model(s.model),
        label.lang(s.targetLang),
        w.ref ? t(w.includeMedia ? 'batch.preset.withMedia' : 'batch.preset.withoutMedia') : null
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <div className="flex flex-wrap gap-2" role="group">
        <Button
          size="sm"
          variant={w.custom ? 'outline' : 'default'}
          aria-pressed={!w.custom}
          onClick={() => ctx.setGrouping(patchWork(ctx.grouping, w.id, { custom: null }))}
        >
          {t('batch.preset.useDefaults')}
        </Button>
        <Button
          size="sm"
          variant={w.custom ? 'default' : 'outline'}
          aria-pressed={!!w.custom}
          // Starts from the defaults, so only what differs needs changing.
          onClick={() => !w.custom && set({})}
        >
          {t('batch.preset.customize')}
        </Button>
      </div>
      {w.custom ? (
        <PresetStep value={s} onChange={set} notesLabel={t('batch.preset.notes')} />
      ) : null}
      {w.ref ? (
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox
            checked={w.includeMedia}
            onCheckedChange={(v) =>
              ctx.setGrouping(patchWork(ctx.grouping, w.id, { includeMedia: v === true }))
            }
          />
          {t('batch.preset.includeMedia')}
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">{t('batch.preset.noMedia')}</p>
      )}
    </Collapsible>
  )
}
