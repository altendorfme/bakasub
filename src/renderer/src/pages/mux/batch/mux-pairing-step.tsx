import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BatchMuxPlanSubtitle } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { languageName, TARGET_LANGUAGES } from '@renderer/lib/languages'
import { Collapsible } from '../../translate/batch/batch-parts'
import {
  looseSubtitles,
  MAX_SUBS_PER_VIDEO,
  rowOverLimit,
  type MuxBatchAction,
  type MuxRow,
  type MuxSub,
  type MuxView
} from './mux-batch-state'

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p

/**
 * Video ↔ subtitles table. The plan's pairing is the starting point; the user moves or drops
 * subtitles, leaves videos out, and decides the ones the plan could not pair (those block).
 */
export function MuxPairingStep({
  view,
  dispatch,
  failedPath,
  failedSub
}: {
  view: MuxView
  dispatch: (a: MuxBatchAction) => void
  /** Video the Main refused on creation: opens already. */
  failedPath: string | null
  failedSub: string | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const included = view.rows.filter((r) => r.include)
  const leftOut = view.rows.filter((r) => r.subs.length > 0 && !r.include)
  const bare = view.rows.filter((r) => r.subs.length === 0)
  const loose = looseSubtitles(view)
  const moveTo = (sub: string, video: string): void => dispatch({ type: 'assign', sub, video })
  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">{t('muxBatch.pairing.body')}</p>

      {view.unresolved.length ? (
        <section
          aria-labelledby="mb-unresolved"
          className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-warning/50 bg-warning/5 p-3"
        >
          <h3 id="mb-unresolved" className="text-sm font-semibold text-warning">
            {t('muxBatch.pairing.unresolved', { count: view.unresolved.length })}
          </h3>
          <p className="text-xs text-muted-foreground">{t('muxBatch.pairing.unresolvedBody')}</p>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {view.unresolved.map((s) => (
              <li
                key={s.path}
                className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_16rem_auto] sm:items-center"
              >
                <span className="min-w-0 break-all text-xs" title={s.path}>
                  {s.relPath}
                </span>
                <VideoSelect
                  label={t('muxBatch.pairing.assignTo', { name: baseName(s.path) })}
                  rows={view.rows}
                  value={null}
                  onChange={(v) => moveTo(s.path, v)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dispatch({ type: 'assign', sub: s.path, video: null })}
                >
                  {t('muxBatch.pairing.ignore')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="mb-videos" className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <h3 id="mb-videos" className="text-sm font-semibold">
          {t('muxBatch.pairing.videos', { count: included.length })}
        </h3>
        {included.map((r) => (
          <VideoCard
            key={r.video.path}
            row={r}
            view={view}
            dispatch={dispatch}
            failedSub={r.video.path === failedPath ? failedSub : null}
            defaultOpen={r.video.path === failedPath || r.subs.some((s) => !s.language)}
          />
        ))}
        {!included.length ? (
          <p className="text-sm text-warning">{t('muxBatch.pairing.noneIncluded')}</p>
        ) : null}
      </section>

      {bare.length || leftOut.length || view.ignored.length ? (
        <details className="rounded-lg border bg-background/30 p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {t('muxBatch.pairing.out', {
              count: bare.length + leftOut.length + view.ignored.length
            })}
          </summary>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3">
            {bare.length ? (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                {bare.map((r) => (
                  <li
                    key={r.video.path}
                    className="grid gap-1.5 text-xs sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center"
                  >
                    <span className="min-w-0 break-all">
                      {r.video.relPath}{' '}
                      <span className="text-muted-foreground">
                        ({t('muxBatch.pairing.noSubtitle')})
                      </span>
                    </span>
                    {loose.length ? (
                      <SubSelect
                        label={t('muxBatch.pairing.addTo', { name: baseName(r.video.path) })}
                        subs={loose}
                        onChange={(sub) => moveTo(sub, r.video.path)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {leftOut.length ? (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                {leftOut.map((r) => (
                  <li key={r.video.path} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 break-all">{r.video.relPath}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        dispatch({ type: 'include', video: r.video.path, include: true })
                      }
                    >
                      {t('batch.issues.include')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            {view.ignored.length ? (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                {view.ignored.map((s) => (
                  <li key={s.path} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 break-all">{s.relPath}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dispatch({ type: 'assign', sub: s.path, video: undefined })}
                    >
                      {t('muxBatch.pairing.restore')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}
    </>
  )
}

function VideoCard({
  row: r,
  view,
  dispatch,
  failedSub,
  defaultOpen
}: {
  row: MuxRow
  view: MuxView
  dispatch: (a: MuxBatchAction) => void
  failedSub: string | null
  defaultOpen: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const loose = looseSubtitles(view)
  const full = r.subs.length >= MAX_SUBS_PER_VIDEO
  return (
    <Collapsible
      title={<span className="break-all">{r.video.relPath}</span>}
      badge={rowOverLimit(r) ? <Badge tone="warning">{t('muxBatch.pairing.max')}</Badge> : null}
      summary={t('muxBatch.pairing.count', { count: r.subs.length })}
      defaultOpen={defaultOpen}
    >
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {r.subs.map((s) => (
          <SubRow
            key={s.file.path}
            sub={s}
            video={r.video.path}
            view={view}
            dispatch={dispatch}
            failed={s.file.path === failedSub}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {loose.length && !full ? (
          <div className="w-64">
            <SubSelect
              label={t('muxBatch.pairing.addTo', { name: baseName(r.video.path) })}
              subs={loose}
              onChange={(sub) => dispatch({ type: 'assign', sub, video: r.video.path })}
            />
          </div>
        ) : null}
        {full ? <span className="text-xs text-muted-foreground">{t('muxPage.max')}</span> : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => dispatch({ type: 'include', video: r.video.path, include: false })}
        >
          {t('batch.issues.leaveOut')}
        </Button>
      </div>
    </Collapsible>
  )
}

function SubRow({
  sub: s,
  video,
  view,
  dispatch,
  failed
}: {
  sub: MuxSub
  video: string
  view: MuxView
  dispatch: (a: MuxBatchAction) => void
  failed: boolean
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const file = baseName(s.file.path)
  const name = (tag: string): string => languageName(tag, i18n.language)
  const langs = [...new Set([s.language, 'und', ...TARGET_LANGUAGES].filter(Boolean))]
  return (
    <li
      className={`grid gap-2 rounded-md border bg-background/40 p-2.5 ${failed ? 'border-destructive/60' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 break-all text-sm font-medium" title={s.file.path}>
          {s.file.relPath}
        </span>
        {s.matchedBy === 'episode' ? (
          <Badge tone="violet">{t('muxBatch.pairing.byEpisode')}</Badge>
        ) : s.matchedBy === 'manual' ? (
          <Badge tone="violet">{t('muxBatch.pairing.manual')}</Badge>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('muxPage.remove', { name: file })}
          onClick={() => dispatch({ type: 'assign', sub: s.file.path, video: null })}
        >
          <X />
        </Button>
      </div>
      <div className="grid items-center gap-2 sm:grid-cols-[11rem_1fr_auto]">
        <Select
          value={s.language}
          onValueChange={(v) =>
            dispatch({ type: 'sub', path: s.file.path, patch: { language: v } })
          }
        >
          <SelectTrigger
            aria-label={`${t('muxPage.language')}: ${file}`}
            aria-invalid={!s.language || undefined}
          >
            <SelectValue placeholder={t('muxPage.needLanguage')} />
          </SelectTrigger>
          <SelectContent>
            {langs.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag === 'und' ? t('muxBatch.pairing.undetermined') : name(tag)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label={`${t('muxPage.name')}: ${file}`}
          value={s.name}
          maxLength={200}
          placeholder={
            s.language && s.language !== 'und' ? name(s.language) : t('muxPage.namePlaceholder')
          }
          onChange={(e) =>
            dispatch({ type: 'sub', path: s.file.path, patch: { name: e.target.value } })
          }
        />
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            aria-label={`${t('muxPage.isDefault')}: ${file}`}
            checked={s.isDefault}
            onCheckedChange={() =>
              dispatch({ type: 'default', video, sub: s.isDefault ? null : s.file.path })
            }
          />
          {t('muxPage.isDefault')}
        </label>
      </div>
      <VideoSelect
        label={t('muxBatch.pairing.moveTo', { name: file })}
        rows={view.rows}
        value={video}
        onChange={(v) => dispatch({ type: 'assign', sub: s.file.path, video: v })}
      />
    </li>
  )
}

/** Which video a subtitle goes to; a video with 32 subtitles is not offered. */
function VideoSelect({
  label,
  rows,
  value,
  onChange
}: {
  label: string
  rows: readonly MuxRow[]
  value: string | null
  onChange: (video: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="text-xs">
        <SelectValue placeholder={t('muxBatch.pairing.pickVideo')} />
      </SelectTrigger>
      <SelectContent>
        {rows.map((r) => (
          <SelectItem
            key={r.video.path}
            value={r.video.path}
            disabled={r.video.path !== value && r.subs.length >= MAX_SUBS_PER_VIDEO}
          >
            {r.video.relPath}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Picks a subtitle that has no video yet (to attach it to a given one). */
function SubSelect({
  label,
  subs,
  onChange
}: {
  label: string
  subs: readonly BatchMuxPlanSubtitle[]
  onChange: (sub: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    // Controlled by `undefined`: the choice is applied at once, the select resets.
    <Select value={undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="text-xs">
        <SelectValue placeholder={t('muxBatch.pairing.addSubtitle')} />
      </SelectTrigger>
      <SelectContent>
        {subs.map((s) => (
          <SelectItem key={s.path} value={s.path}>
            {s.relPath}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
