import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, MinusCircle, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SubtitleTrackInfo } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { editRow, useTrackText, type BatchCtx } from './batch-ctx'
import type { RowProblem } from './batch-rows'
import { workOf, type Work } from './works'

export function TrackSelect({
  tracks,
  value,
  onChange,
  className
}: {
  tracks: readonly SubtitleTrackInfo[]
  value: number | null
  onChange: (id: number) => void
  className?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const text = useTrackText()
  return (
    <Select value={value === null ? '' : String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger
        className={cn('h-8 w-80 max-w-full text-xs', className)}
        aria-label={t('batch.tracks.pick')}
      >
        <SelectValue placeholder={t('batch.tracks.pick')} />
      </SelectTrigger>
      <SelectContent>
        {tracks.map((tr) => (
          <SelectItem key={tr.id} value={String(tr.id)} disabled={tr.format === null}>
            #{tr.id} · {text(tr)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function KindBadge({ work }: { work: Work }): React.JSX.Element {
  const { t } = useTranslation()
  return work.ref ? (
    <Badge tone="violet">
      {t(work.ref.kind === 'series' ? 'batch.works.series' : 'batch.works.movie')}
    </Badge>
  ) : (
    <Badge tone="warning">{t('batch.works.notFound')}</Badge>
  )
}

/** Season and episode of one file (series only). */
export function EpisodeFields({ ctx, index }: { ctx: BatchCtx; index: number }): React.JSX.Element {
  const { t } = useTranslation()
  const r = ctx.rows[index]
  const num = (v: string): number | null => (/^\d{1,4}$/.test(v) ? Number(v) : null)
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      S
      <Input
        aria-label={t('batch.works.season')}
        className="h-7 w-11 px-1.5 text-xs"
        inputMode="numeric"
        value={r.season ?? ''}
        onChange={(e) => editRow(ctx, index, { season: num(e.target.value) })}
      />
      E
      <Input
        aria-label={t('batch.works.episode')}
        className="h-7 w-12 px-1.5 text-xs"
        inputMode="numeric"
        value={r.episode ?? ''}
        onChange={(e) => editRow(ctx, index, { episode: num(e.target.value) })}
      />
    </span>
  )
}

/** "N ready · N need you · N left out · N works". */
export function StatusLine({ ctx }: { ctx: BatchCtx }): React.JSX.Element {
  const { t } = useTranslation()
  const included = ctx.rows.filter((r) => r.include).length
  const attention = ctx.rows.filter((r, i) => r.include && ctx.problems[i]).length
  const out = ctx.rows.length - included
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="status">
      <span className="flex items-center gap-1.5 text-success">
        <CheckCircle2 className="size-4" />
        {t('batch.status.ready', { count: included - attention })}
      </span>
      {attention ? (
        <span className="flex items-center gap-1.5 text-warning">
          <AlertTriangle className="size-4" />
          {t('batch.status.attention', { count: attention })}
        </span>
      ) : null}
      {out ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <MinusCircle className="size-4" />
          {t('batch.status.out', { count: out })}
        </span>
      ) : null}
      <span className="flex items-center gap-1.5 text-violet">
        <Sparkles className="size-4" />
        {t('batch.status.works', { count: ctx.grouping.works.length })}
      </span>
    </p>
  )
}

const EPISODE: ReadonlySet<RowProblem> = new Set(['no-episode'])

/**
 * Included files that need a look, with the fix inline. `only` narrows to the step's concern:
 * tracks (Tracks step) or episodes (Works step); without it, everything (review).
 */
export function Issues({
  ctx,
  only
}: {
  ctx: BatchCtx
  only?: 'tracks' | 'works'
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const list = ctx.rows.flatMap((r, i) => {
    const p = ctx.problems[i]
    if (!p || !r.include) return []
    if (only === 'works' && !EPISODE.has(p)) return []
    if (only === 'tracks' && EPISODE.has(p)) return []
    return [i]
  })
  if (!list.length) return null
  return (
    <section
      aria-labelledby="batch-issues"
      className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3"
    >
      <h3 id="batch-issues" className="flex items-center gap-2 text-sm font-semibold text-warning">
        <AlertTriangle className="size-4" />
        {t('batch.issues.title', { count: list.length })}
      </h3>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {list.map((i) => {
          const r = ctx.rows[i]
          const series = workOf(ctx.grouping, r)?.ref?.kind === 'series'
          return (
            <li
              key={r.item.path}
              className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-md border bg-background/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm break-all">{r.item.relPath}</span>
                <Badge tone="warning">{t(`batch.problem.${ctx.problems[i]!}`)}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {only !== 'works' && r.item.tracks?.length ? (
                  <TrackSelect
                    tracks={r.item.tracks}
                    value={r.trackId}
                    onChange={(trackId) => editRow(ctx, i, { trackId })}
                  />
                ) : null}
                {only !== 'tracks' && series ? <EpisodeFields ctx={ctx} index={i} /> : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => editRow(ctx, i, { include: false })}
                >
                  {t('batch.issues.leaveOut')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Files that will not be translated: skipped by the plan (with why) or left out by the user. */
export function LeftOut({ ctx }: { ctx: BatchCtx }): React.JSX.Element | null {
  const { t } = useTranslation()
  const list = ctx.rows.flatMap((r, i) => (r.include ? [] : [i]))
  if (!list.length) return null
  return (
    <details className="rounded-lg border bg-background/30 p-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        {t('batch.issues.out', { count: list.length })}
      </summary>
      <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {list.map((i) => {
          const r = ctx.rows[i]
          return (
            <li key={r.item.path} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 break-all">{r.item.relPath}</span>
              <span className="text-muted-foreground" title={r.item.error}>
                {r.item.skipped
                  ? t(`batch.problem.${r.item.skipped}`)
                  : r.previousOutput
                    ? t('batch.issues.previousOutput')
                    : t('batch.issues.byYou')}
              </span>
              {!r.item.skipped ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => editRow(ctx, i, { include: true })}
                >
                  {t('batch.issues.include')}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

/** A card with a one-line summary that opens to its details. */
export function Collapsible({
  title,
  badge,
  summary,
  defaultOpen,
  children
}: {
  title: React.ReactNode
  badge?: React.ReactNode
  summary: string
  defaultOpen?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <article className="rounded-lg border bg-background/30">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span className="grid grid-cols-[minmax(0,1fr)] min-w-0 flex-1 gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {title}
            {badge}
          </span>
          <span className="truncate text-xs text-muted-foreground" title={summary}>
            {summary}
          </span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t p-3">{children}</div>
      ) : null}
    </article>
  )
}
