import { Plus, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TitleSearch } from '@renderer/components/media/title-search'
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
import { useMediaLookup } from '@renderer/data/media'
import { cn } from '@renderer/lib/utils'
import type { BatchCtx } from './batch-ctx'
import { EpisodeFields, Issues, KindBadge, LeftOut } from './batch-parts'
import { mergeWork, moveFile, patchWork, rowsOf, type Work } from './works'

/**
 * Automatic grouping by the work recognized in each file name; editable by hand. The
 * episode numbers live here too, since they only make sense once the work is right.
 */
export function WorksStep({ ctx }: { ctx: BatchCtx }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">{t('batch.works.body')}</p>
      <div>
        <Button size="sm" disabled={!ctx.regrouped} onClick={() => ctx.setGrouping(null)}>
          <RotateCcw />
          {t('batch.works.regroup')}
        </Button>
      </div>
      <Issues ctx={ctx} only="works" />
      {ctx.grouping.works.map((w) => (
        <WorkCard key={w.id} ctx={ctx} work={w} />
      ))}
      <LeftOut ctx={ctx} />
    </>
  )
}

function WorkCard({ ctx, work: w }: { ctx: BatchCtx; work: Work }): React.JSX.Element {
  const { t } = useTranslation()
  const g = ctx.grouping
  const idx = rowsOf(g, ctx.rows, w.id)
  const details = useMediaLookup(w.ref, null).data?.details
  const others = g.works.filter((x) => x.id !== w.id)
  return (
    <article
      aria-label={w.name}
      className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border bg-background/30 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t('batch.works.name')}
          className="h-8 max-w-xs font-medium"
          value={w.name}
          onChange={(e) => ctx.setGrouping(patchWork(g, w.id, { name: e.target.value }))}
        />
        <KindBadge work={w} />
        {w.manual ? <Badge tone="primary">{t('batch.works.manual')}</Badge> : null}
        <span className="text-xs text-muted-foreground">
          {t('batch.works.files', { count: idx.length })}
        </span>
        {others.length ? (
          <Select value="" onValueChange={(into) => ctx.setGrouping(mergeWork(g, w.id, into))}>
            <SelectTrigger
              className="ml-auto h-8 w-44 text-xs"
              aria-label={t('batch.works.mergeInto')}
            >
              <SelectValue placeholder={t('batch.works.mergeInto')} />
            </SelectTrigger>
            <SelectContent>
              {others.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        <span className="text-xs text-muted-foreground">{t('batch.works.tmdb')}</span>
        <TitleSearch
          value={details?.title ?? w.name}
          selectedId={w.ref?.id ?? null}
          onPick={(res) =>
            ctx.setGrouping(
              patchWork(g, w.id, {
                ref: { provider: 'tmdb', id: res.id, kind: res.kind },
                // Keep a name the user typed; follow the match otherwise.
                name: w.name === (details?.title ?? w.name) ? res.title : w.name
              })
            )
          }
        />
        {details ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {[details.year, details.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
            {details.synopsis ? ` — ${details.synopsis}` : ''}
          </p>
        ) : null}
      </div>

      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 border-t pt-3">
        {idx.map((i) => {
          const r = ctx.rows[i]
          return (
            <li
              key={r.item.path}
              className={cn(
                'flex flex-wrap items-center gap-2 text-xs',
                !r.include && 'opacity-50'
              )}
            >
              {w.ref?.kind === 'series' ? <EpisodeFields ctx={ctx} index={i} /> : null}
              <span className="min-w-0 flex-1 truncate" title={r.item.relPath}>
                {r.item.relPath}
              </span>
              <Select value="" onValueChange={(to) => ctx.setGrouping(moveFile(g, r, to))}>
                <SelectTrigger className="h-7 w-36 text-xs" aria-label={t('batch.works.moveTo')}>
                  <SelectValue placeholder={t('batch.works.moveTo')} />
                </SelectTrigger>
                <SelectContent>
                  {others.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">
                    <Plus className="size-3.5" />
                    {t('batch.works.newWork')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
