import { useTranslation } from 'react-i18next'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { useTrackText } from '../../translate/batch/batch-ctx'
import { Collapsible } from '../../translate/batch/batch-parts'
import {
  rowBlocked,
  signatureChoices,
  signatureEdits,
  textTracks,
  type ExtractEdit,
  type ExtractRow
} from './extract-batch-state'

/**
 * Which tracks to save: one checkbox per kind of track across the files (language + name +
 * format), then each file, expandable, to fine-tune or leave it out.
 */
export function ExtractTracksStep({
  rows,
  edit,
  failedPath
}: {
  rows: readonly ExtractRow[]
  edit: (edits: Record<string, ExtractEdit>) => void
  /** File the Main refused on creation: opens already. */
  failedPath: string | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const text = useTrackText()
  const included = rows.filter((r) => r.include)
  const left = rows.filter((r) => !r.include && !r.item.skipped)
  const choices = signatureChoices(rows)
  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">{t('extractBatch.tracks.body')}</p>

      <section aria-labelledby="eb-kinds" className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <h3 id="eb-kinds" className="text-sm font-semibold">
          {t('extractBatch.tracks.kinds')}
        </h3>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          {choices.map((c) => (
            <li key={c.signature}>
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox
                  checked={
                    c.selected === 0 ? false : c.selected === c.files ? true : 'indeterminate'
                  }
                  onCheckedChange={() =>
                    edit(signatureEdits(rows, c.signature, c.selected < c.files))
                  }
                />
                <span className="min-w-0 flex-1">{text(c.track, false)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {c.selected}/{c.files}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="eb-files" className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <h3 id="eb-files" className="text-sm font-semibold">
          {t('extractBatch.tracks.perFile')}
        </h3>
        {included.map((r) => {
          const tracks = r.item.tracks ?? []
          const blocked = rowBlocked(r)
          return (
            <Collapsible
              key={r.item.path}
              title={<span className="break-all">{r.item.relPath}</span>}
              badge={blocked ? <Badge tone="warning">{t('batch.problem.no-track')}</Badge> : null}
              summary={t('extractBatch.tracks.count', {
                selected: r.trackIds.length,
                total: textTracks(r.item).length
              })}
              defaultOpen={blocked || r.item.path === failedPath}
            >
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                {tracks.map((tr) => (
                  <li key={tr.id}>
                    <label className="flex items-center gap-2.5 text-xs">
                      <Checkbox
                        disabled={tr.format === null}
                        checked={r.trackIds.includes(tr.id)}
                        onCheckedChange={(v) =>
                          edit({
                            [r.item.path]: {
                              trackIds:
                                v === true
                                  ? [...r.trackIds, tr.id].sort((a, b) => a - b)
                                  : r.trackIds.filter((id) => id !== tr.id)
                            }
                          })
                        }
                      />
                      <span className={tr.format === null ? 'text-muted-foreground' : undefined}>
                        #{tr.id} · {text(tr)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="ghost"
                className="justify-self-end"
                onClick={() => edit({ [r.item.path]: { include: false } })}
              >
                {t('batch.issues.leaveOut')}
              </Button>
            </Collapsible>
          )
        })}
      </section>

      {left.length ? (
        <details className="rounded-lg border bg-background/30 p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {t('batch.issues.out', { count: left.length })}
          </summary>
          <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5">
            {left.map((r) => (
              <li key={r.item.path} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 break-all">{r.item.relPath}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => edit({ [r.item.path]: { include: true } })}
                >
                  {t('batch.issues.include')}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}
