import { useTranslation } from 'react-i18next'
import type { EpisodeDetails, ReleaseNameInfo } from '@shared/ipc-contract'
import { episodeCode } from '@renderer/lib/episode'
import { cn } from '@renderer/lib/utils'

/** Editable season/episode (pre-filled from the file name) and the episode TMDB returned. */
export function EpisodeFields({
  season,
  episode,
  release,
  details,
  loading,
  onChange
}: {
  season: number | null
  episode: number | null
  release: ReleaseNameInfo | undefined
  details: EpisodeDetails | null | undefined
  loading: boolean
  onChange: (n: { season: number | null; episode: number | null }) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const fileCode =
    release?.season !== undefined && release.episode !== undefined
      ? episodeCode(release.season, release.episode)
      : undefined
  const code = season !== null && episode !== null ? episodeCode(season, episode) : undefined
  const fromFile = fileCode !== undefined && code === fileCode
  const num = (v: string): number | null => (v === '' ? null : Math.max(0, Math.floor(Number(v))))
  const field =
    'h-8 w-16 rounded-md border border-input bg-background/60 px-2 text-sm tabular-nums focus:border-primary'

  return (
    <div className="grid gap-1.5 border-l-2 border-primary pl-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          {t('media.season')}
          <input
            type="number"
            min={0}
            value={season ?? ''}
            onChange={(e) => onChange({ season: num(e.target.value), episode })}
            className={field}
          />
        </label>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          {t('media.episode')}
          <input
            type="number"
            min={1}
            value={episode ?? ''}
            onChange={(e) => onChange({ season, episode: num(e.target.value) })}
            className={field}
          />
        </label>
        {/* Same color as "Recognized from the file name": both say the file name was used. */}
        <span className={cn('text-xs', fromFile ? 'text-violet' : 'text-muted-foreground')}>
          {fromFile
            ? t('media.fromFile')
            : fileCode
              ? t('media.changed', { code: fileCode })
              : t('media.notInFile')}
        </span>
      </div>
      {release?.absoluteEpisode !== undefined && !code ? (
        <p className="text-xs text-warning">
          {t('media.absolute', { n: release.absoluteEpisode })}
        </p>
      ) : null}
      {!code ? (
        <p className="text-sm text-muted-foreground">{t('media.enterEpisode')}</p>
      ) : loading ? null : details ? (
        <>
          <p className="text-sm font-medium">
            {code}
            {details.title ? `: ${details.title}` : ''}
          </p>
          {details.synopsis ? (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {details.synopsis}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('media.noEpisodeSynopsis', { code })}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t('media.noEpisode', { code })}</p>
      )}
    </div>
  )
}
