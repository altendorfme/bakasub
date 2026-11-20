import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MediaContextLookup, Preset, SubtitleTrackInfo } from '@shared/ipc-contract'
import { useModels } from '@renderer/data/models'
import { episodeCode } from '@renderer/lib/episode'
import type { ExistingTarget } from '@renderer/lib/existing-subtitle'
import { languageName } from '@renderer/lib/languages'
import { presetLabel } from '@renderer/lib/preset-labels'
import { cn } from '@renderer/lib/utils'
import { stepsFor, type WizardState, type WizardStep } from './wizard-state'

/** Everything chosen so far, one row per item; a row takes the user to its step when reachable. */
export function WizardSummary({
  state,
  preset,
  model,
  targetLang,
  track,
  media,
  existing,
  outputNames,
  canGo,
  onGo
}: {
  state: WizardState
  preset: Preset | undefined
  model: string | null
  targetLang: string | null
  track: SubtitleTrackInfo | undefined
  media: MediaContextLookup | undefined
  existing: ExistingTarget | null
  /** Files the job will write (the subtitle path, with the output folder). */
  outputNames: readonly string[]
  canGo: (s: WizardStep) => boolean
  onGo: (s: WizardStep) => void
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const catalog = useModels().data?.models
  const none = t('translate.summary.none')
  const steps = stepsFor(state.file?.kind)
  const lang = (tag: string): string => languageName(tag, i18n.language)

  const rows: { step: WizardStep; label: string; value: string; warn?: string; detail?: string }[] =
    [
      { step: 'file', label: t('translate.summary.file'), value: state.file?.name ?? none },
      ...(state.file?.kind !== 'subtitle'
        ? [
            {
              step: 'track' as const,
              label: t('translate.summary.track'),
              value: track
                ? [
                    track.language ? lang(track.language) : t('translate.track.unknownLang'),
                    track.format?.toUpperCase()
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : none
            }
          ]
        : []),
      {
        step: 'preset',
        label: t('translate.summary.preset'),
        value: preset ? presetLabel(preset, t) : none
      },
      {
        step: 'preset',
        label: t('translate.summary.model'),
        value: model ? (catalog?.find((m) => m.id === model)?.name ?? model) : none
      },
      {
        step: 'preset',
        label: t('translate.summary.language'),
        value: targetLang ? lang(targetLang) : none,
        ...(existing && targetLang
          ? { warn: t('translate.existing.inline', { language: lang(targetLang) }) }
          : {})
      },
      {
        step: 'preset',
        label: t('translate.summary.media'),
        value: !state.media.ref
          ? none
          : !state.media.include
            ? t('translate.summary.mediaOff')
            : media
              ? `${media.details.title}${media.episode ? ` · ${episodeCode(media.episode.season, media.episode.episode)}` : ''}`
              : '…'
      },
      {
        step: 'output',
        label: t('translate.summary.output'),
        value: state.outputDir ?? t('translate.output.nextToSource'),
        detail: outputNames.join(' · ')
      }
    ]

  return (
    <aside
      aria-labelledby="wizard-summary"
      className="grid content-start gap-3 rounded-xl border bg-card/92 p-4 lg:sticky lg:top-6"
    >
      <h2 id="wizard-summary" className="text-sm font-semibold">
        {t('translate.summary.title')}
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
                  aria-label={`${r.label}: ${r.value}. ${t('translate.summary.edit', { step: t(`translate.steps.${r.step}`) })}`}
                  className={cn(
                    'grid w-full gap-0.5 rounded-md px-2 py-1.5 text-left disabled:cursor-default',
                    go && 'hover:bg-accent',
                    state.step === r.step && 'bg-accent/60'
                  )}
                >
                  <span className="text-[11px] text-muted-foreground">{r.label}</span>
                  <span
                    className={cn('truncate text-sm', r.value === none && 'text-muted-foreground')}
                    title={r.value}
                  >
                    {r.value}
                  </span>
                  {r.detail ? (
                    <span className="truncate text-xs text-muted-foreground" title={r.detail}>
                      {r.detail}
                    </span>
                  ) : null}
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
