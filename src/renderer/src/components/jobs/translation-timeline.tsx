import { useTranslation } from 'react-i18next'
import type { TimelineRange, TranslationTimeline as Timeline } from '@shared/ipc-contract'
import { cn } from '@renderer/lib/utils'

type Layer = 'cached' | 'translated' | 'active' | 'failed'

/** Ordem de pintura: o que está por cima vence (em voo cobre "a traduzir", falha cobre tudo). */
const LAYERS: readonly { key: Layer; className: string }[] = [
  { key: 'cached', className: 'bg-violet/45' },
  { key: 'translated', className: 'bg-primary' },
  { key: 'active', className: 'bg-primary/45 motion-safe:animate-pulse' },
  { key: 'failed', className: 'bg-destructive' }
]

const pct = (n: number, total: number): string => `${(n / total) * 100}%`

/**
 * O episódio inteiro, na ordem dos timestamps: cache, o que já voltou traduzido, os trechos em
 * voo (um por lane) e as falhas. Os traços verticais marcam onde o arquivo foi cortado em lanes.
 */
export function TranslationTimeline({
  timeline,
  done
}: {
  timeline: Timeline
  done: number
}): React.JSX.Element {
  const { t } = useTranslation()
  const { total } = timeline
  const present = LAYERS.filter((l) => timeline[l.key].length > 0)
  return (
    <div className="grid gap-1.5">
      <div
        role="progressbar"
        aria-label={t('jobs.timeline.label')}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="relative h-2.5 overflow-hidden rounded-full bg-muted"
      >
        {total > 0
          ? LAYERS.map((l) =>
              timeline[l.key].map(([from, to]: TimelineRange) => (
                <span
                  key={`${l.key}-${from}`}
                  data-layer={l.key}
                  className={cn('absolute inset-y-0', l.className)}
                  style={{ left: pct(from, total), width: pct(to - from, total) }}
                />
              ))
            )
          : null}
        {total > 0 && timeline.lanes.length > 1
          ? timeline.lanes
              .slice(1)
              .map(([from]) => (
                <span
                  key={`cut-${from}`}
                  data-layer="cut"
                  aria-hidden
                  className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background"
                  style={{ left: pct(from, total) }}
                />
              ))
          : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {present.map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2 rounded-full', l.className)} />
            {t(`jobs.timeline.${l.key}`)}
          </span>
        ))}
        {timeline.lanes.length > 1 ? (
          <span className="ml-auto">
            {t('jobs.timeline.lanes', { count: timeline.lanes.length })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
