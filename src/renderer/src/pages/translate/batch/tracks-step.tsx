import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { editRow, useTrackText, type BatchCtx } from './batch-ctx'
import { Collapsible, Issues, KindBadge, LeftOut, TrackSelect } from './batch-parts'
import { majorityTrack, trackChoices, trackEdits, trackOf, trackSignature } from './batch-rows'
import { rowsOf } from './works'

/** Exceptions first; then one card per work with its track and the per-file override. */
export function TracksStep({ ctx }: { ctx: BatchCtx }): React.JSX.Element {
  const { t } = useTranslation()
  const text = useTrackText()
  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">{t('batch.tracks.body')}</p>
      <Issues ctx={ctx} only="tracks" />
      {ctx.grouping.works.map((w) => {
        const idx = rowsOf(ctx.grouping, ctx.rows, w.id).filter(
          (i) => ctx.rows[i].include && ctx.rows[i].item.tracks?.length
        )
        if (!idx.length) return null
        const rows = idx.map((i) => ctx.rows[i])
        const sig = majorityTrack(rows)
        const sample = rows.map(trackOf).find((tr) => tr && trackSignature(tr) === sig)
        const odd = rows.filter((r) => {
          const tr = trackOf(r)
          return !tr || trackSignature(tr) !== sig
        }).length
        return (
          <Collapsible
            key={w.id}
            title={w.name}
            badge={<KindBadge work={w} />}
            summary={[
              t('batch.works.files', { count: idx.length }),
              sample ? text(sample, false) : t('batch.tracks.pick'),
              odd ? t('batch.tracks.different', { count: odd }) : null
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('batch.tracks.workTrack')}</span>
              <Select value={sig ?? ''} onValueChange={(s) => ctx.edit(trackEdits(rows, s))}>
                <SelectTrigger className="h-8 w-96 max-w-full text-xs">
                  <SelectValue placeholder={t('batch.tracks.pick')} />
                </SelectTrigger>
                <SelectContent>
                  {trackChoices(rows).map((c) => (
                    <SelectItem key={c.signature} value={c.signature}>
                      {text(c.track, false)} ({c.count}/{rows.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
              {idx.map((i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate" title={ctx.rows[i].item.relPath}>
                    {ctx.rows[i].item.relPath}
                  </span>
                  <TrackSelect
                    tracks={ctx.rows[i].item.tracks ?? []}
                    value={ctx.rows[i].trackId}
                    onChange={(trackId) => editRow(ctx, i, { trackId })}
                  />
                </li>
              ))}
            </ul>
          </Collapsible>
        )
      })}
      <LeftOut ctx={ctx} />
    </>
  )
}
