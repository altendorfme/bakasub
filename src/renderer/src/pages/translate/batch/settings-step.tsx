import { useTranslation } from 'react-i18next'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { PresetPicker, PresetStep } from '../preset-step'
import { suggestionHint } from '../suggestion-hint'
import type { BatchCtx } from './batch-ctx'
import { Collapsible, KindBadge } from './batch-parts'
import { defaultSettings } from './batch-state'
import { useSettingsLabels } from './use-settings-labels'
import {
  effectiveSettings,
  patchWork,
  rowsOf,
  workPreset,
  type Work,
  type WorkSettings
} from './works'

/**
 * Model, language and notes for the whole batch, then one card per work: its preset (suggested
 * from TMDB: Japanese animation → Anime, movie → Movie…), its media, and optionally its own
 * model, language and notes. There is no batch-wide preset: one style rarely fits every work.
 */
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
        <PresetStep value={ctx.options} onChange={ctx.setOptions} withPreset={false} />
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
  const suggestion = ctx.suggestions[w.id]
  const presetId = workPreset(w, ctx.suggestions)
  const set = (patch: Partial<WorkSettings>): void =>
    ctx.setGrouping(patchWork(ctx.grouping, w.id, { custom: { ...s, ...patch } }))
  return (
    <Collapsible
      title={w.name}
      defaultOpen
      badge={
        <>
          <KindBadge work={w} />
          {w.custom ? <Badge tone="primary">{t('batch.preset.customized')}</Badge> : null}
        </>
      }
      summary={[
        t('batch.works.files', { count: n }),
        label.preset(presetId),
        label.model(s.model),
        label.lang(s.targetLang),
        w.ref ? t(w.includeMedia ? 'batch.preset.withMedia' : 'batch.preset.withoutMedia') : null
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <PresetPicker
        value={presetId}
        onChange={(id) =>
          ctx.setGrouping(
            // Picking the suggestion again goes back to following it (a new match updates it).
            patchWork(ctx.grouping, w.id, {
              presetId: suggestion && id === suggestion.presetId ? null : id
            })
          )
        }
        hint={suggestionHint({
          t,
          suggestion,
          presetId,
          hasWork: !!w.ref,
          presetName: label.preset,
          onUseSuggestion: () => ctx.setGrouping(patchWork(ctx.grouping, w.id, { presetId: null }))
        })}
      />

      <div className="grid gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">{t('batch.preset.modelLang')}</span>
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
          <PresetStep
            value={s}
            onChange={set}
            notesLabel={t('batch.preset.notes')}
            withPreset={false}
          />
        ) : null}
      </div>
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
