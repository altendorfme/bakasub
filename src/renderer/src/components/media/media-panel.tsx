import { useEffect, useState } from 'react'
import { Film } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GuideDialog } from '@renderer/components/common/guide-dialog'
import { KeyForm } from '@renderer/components/forms/key-form'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { useIdentify, useMediaLookup } from '@renderer/data/media'
import { useSetTmdbKey } from '@renderer/data/settings'
import { episodeCode } from '@renderer/lib/episode'
import { cn } from '@renderer/lib/utils'
import { EpisodeFields } from './episode-fields'
import type { MediaChoice } from './media-choice'
import { TitleSearch } from './title-search'

/**
 * TMDB context for a file: recognized from the name when possible, searchable, with an editable
 * episode for series and an "Include" switch. Controlled by the wizard (`MediaChoice`).
 */
export function MediaPanel({
  fileName,
  value,
  onChange
}: {
  fileName: string
  value: MediaChoice
  onChange: (patch: Partial<MediaChoice>) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const identify = useIdentify(fileName)
  const id = identify.data
  const release = id?.release
  const series = value.ref?.kind === 'series'
  const ep =
    series && value.season !== null && value.episode !== null
      ? { season: value.season, episode: value.episode }
      : null
  const lookup = useMediaLookup(value.ref, ep)
  const details = lookup.data?.details

  // Seed once per file from the identification; a later user change is never overwritten.
  useEffect(() => {
    if (!id || value.seeded) return
    onChange({
      seeded: true,
      ref: id.match ? { provider: 'tmdb', id: id.match.id, kind: id.match.kind } : null,
      auto: !!id.match,
      season: id.release.season ?? null,
      episode: id.release.episode ?? null
    })
  }, [id, value.seeded, onChange])

  if (id?.status === 'no-key') return <NoKey />

  const fileEpisode =
    release?.season !== undefined && release.episode !== undefined
      ? episodeCode(release.season, release.episode)
      : undefined

  return (
    <section
      className="grid gap-4 rounded-xl border bg-card/92 p-5"
      aria-labelledby="media-heading"
    >
      <h3 id="media-heading" className="sr-only">
        {t('media.heading')}
      </h3>
      <div className="flex gap-5">
        <div className="w-24 shrink-0 sm:w-28">
          {details?.posterUrl ? (
            <img
              src={details.posterUrl}
              alt=""
              className="aspect-[2/3] w-full rounded-lg object-cover shadow-lg ring-1 ring-black/20"
            />
          ) : (
            <div className="grid aspect-[2/3] w-full place-items-center rounded-lg border border-dashed text-muted-foreground">
              {identify.isPending ? (
                <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Film className="size-6" />
              )}
            </div>
          )}
        </div>

        <div className="grid min-w-0 flex-1 content-start gap-3">
          <TitleSearch
            key={details?.id ?? 'none'}
            value={details?.title ?? release?.title ?? ''}
            selectedId={value.ref?.id ?? null}
            onPick={(r) =>
              onChange({ ref: { provider: 'tmdb', id: r.id, kind: r.kind }, auto: false })
            }
          />

          {identify.isPending ? (
            <p className="text-sm text-muted-foreground">
              {t('media.identifying', { query: fileName })}
            </p>
          ) : (identify.isError || id?.status === 'offline') && !value.ref ? (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              {t('media.offline')}
            </p>
          ) : id?.status === 'not-found' && !value.ref ? (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              {t('media.notFound', { query: release?.title ?? fileName })}
            </p>
          ) : null}

          {details ? (
            <div className={cn('grid gap-3 transition-opacity', !value.include && 'opacity-45')}>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {details.year ? <span>{details.year}</span> : null}
                <span>{details.kind === 'series' ? t('media.series') : t('media.movie')}</span>
                {details.runtime ? (
                  <span>{t('media.runtime', { minutes: details.runtime })}</span>
                ) : null}
                {value.auto ? (
                  <span className="text-xs text-violet">{t('media.recognized')}</span>
                ) : null}
              </p>
              {details.genres.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {details.genres.map((g) => (
                    <li
                      key={g}
                      className="rounded-full bg-secondary px-2 py-0.5 text-xs text-violet"
                    >
                      {g}
                    </li>
                  ))}
                </ul>
              ) : null}
              {details.synopsis ? (
                <p className="max-w-prose text-sm leading-relaxed">{details.synopsis}</p>
              ) : null}
              {details.kind === 'movie' && fileEpisode ? (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                  {t('media.movieWithEpisode', { code: fileEpisode })}
                </p>
              ) : null}
              {details.kind === 'series' ? (
                <EpisodeFields
                  season={value.season}
                  episode={value.episode}
                  release={release}
                  details={ep ? lookup.data?.episode : undefined}
                  loading={lookup.isFetching}
                  onChange={(n) => onChange(n)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        {details ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.include}
              onCheckedChange={(v) => onChange({ include: v === true })}
            />
            {t('media.include')}
          </label>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">{t('media.attribution')}</span>
      </div>
    </section>
  )
}

/** Without a TMDB key: one line, the guide, and the key form on demand. */
function NoKey(): React.JSX.Element {
  const { t } = useTranslation()
  const save = useSetTmdbKey()
  const [open, setOpen] = useState(false)
  return (
    <section className="grid gap-3 rounded-xl border border-dashed bg-card/92 p-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Film className="mt-0.5 size-4 shrink-0" />
        {t('media.noKey')}
      </p>
      {open ? (
        <KeyForm
          label={t('welcome.tmdb.label')}
          present={false}
          saving={save.isPending}
          error={save.error}
          onSave={(key) => save.mutateAsync(key)}
          guide={<GuideDialog id="tmdb-key" />}
        />
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            {t('media.addKey')}
          </Button>
          <GuideDialog id="tmdb-key" />
        </div>
      )}
    </section>
  )
}
