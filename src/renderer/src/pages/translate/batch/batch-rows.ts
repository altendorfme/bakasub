import type {
  BatchPlan,
  MediaIdentification,
  MediaRef,
  SubtitleTrackInfo
} from '@shared/ipc-contract'
import type { BatchPlanItem } from '@shared/ipc-contract'

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p

/** One file of the batch as the wizard shows it: plan item + identification + user edits. */
export interface BatchRow {
  item: BatchPlanItem
  include: boolean
  trackId: number | null
  /** What `media:identify` recognized (the work's TMDB match drives the automatic grouping). */
  match: MediaRef | null
  /** Title for grouping and labels: TMDB title, else the parsed one, else the file name. */
  title: string
  season: number | null
  episode: number | null
}

/** User changes, kept apart from the seed so a new identification never overwrites them. */
export type RowEdit = Partial<Pick<BatchRow, 'include' | 'trackId' | 'season' | 'episode'>>

/** Rows from the plan and the identifications (same order); skipped files start excluded. */
export function seedRows(
  plan: BatchPlan,
  ids: readonly (MediaIdentification | undefined)[]
): BatchRow[] {
  return plan.items.map((item, i) => {
    const id = ids[i]
    const rel = id?.release
    // `Show - 28`: absolute numbering, read as season 1 until the user says otherwise.
    const episode = rel?.episode ?? rel?.absoluteEpisode ?? null
    return {
      item,
      include: !item.skipped,
      trackId: item.selected[0] ?? null,
      match: id?.match ? { provider: 'tmdb', id: id.match.id, kind: id.match.kind } : null,
      title: id?.match?.title ?? (rel?.title || baseName(item.path)),
      season: rel?.season ?? (episode !== null ? 1 : null),
      episode
    }
  })
}

export function applyEdits(rows: readonly BatchRow[], edits: Record<string, RowEdit>): BatchRow[] {
  return rows.map((r) => {
    const e = edits[r.item.path]
    if (!e) return r
    // A skipped file has nothing to translate: it cannot be included back.
    return { ...r, ...e, include: r.item.skipped ? false : (e.include ?? r.include) }
  })
}

/** "The same track" across files: language + name + format (ids differ between releases). */
export const trackSignature = (t: SubtitleTrackInfo): string =>
  `${t.language ?? ''}|${(t.name ?? '').trim().toLowerCase()}|${t.format ?? ''}`

export const trackOf = (r: BatchRow): SubtitleTrackInfo | undefined =>
  r.item.tracks?.find((t) => t.id === r.trackId)

/** Most common chosen track among the rows (ties: first seen). */
export function majorityTrack(rows: readonly BatchRow[]): string | undefined {
  const count = new Map<string, number>()
  for (const r of rows) {
    const t = trackOf(r)
    if (t) count.set(trackSignature(t), (count.get(trackSignature(t)) ?? 0) + 1)
  }
  let best: string | undefined
  for (const [sig, n] of count) if (best === undefined || n > count.get(best)!) best = sig
  return best
}

/** Edits that pick the track with `signature` in every row that has one. */
export function trackEdits(rows: readonly BatchRow[], signature: string): Record<string, RowEdit> {
  const out: Record<string, RowEdit> = {}
  for (const r of rows) {
    const t = r.item.tracks?.find((x) => x.format !== null && trackSignature(x) === signature)
    if (t) out[r.item.path] = { trackId: t.id }
  }
  return out
}

/** Text tracks offered for a set of rows, by signature, most common first. */
export function trackChoices(
  rows: readonly BatchRow[]
): { signature: string; track: SubtitleTrackInfo; count: number }[] {
  const m = new Map<string, { signature: string; track: SubtitleTrackInfo; count: number }>()
  for (const r of rows)
    for (const t of r.item.tracks ?? []) {
      if (t.format === null) continue
      const sig = trackSignature(t)
      const e = m.get(sig)
      if (e) e.count++
      else m.set(sig, { signature: sig, track: t, count: 1 })
    }
  return [...m.values()].sort((a, b) => b.count - a.count)
}

/**
 * Why a row needs a look. `blocking` ones stop the batch (an included video without a track);
 * the rest are advice: the file is excluded (skipped) or will run with less context.
 */
export type RowProblem =
  | 'no-subtitle-track'
  | 'no-supported-track'
  | 'probe-failed'
  | 'no-track'
  | 'odd-track'
  | 'no-episode'

export const BLOCKING: ReadonlySet<RowProblem> = new Set(['no-track'])

export function rowProblem(
  r: BatchRow,
  ctx: { majority?: string; series: boolean }
): RowProblem | null {
  if (r.item.skipped) return r.item.skipped
  if (!r.include) return null
  if (r.item.tracks && r.trackId === null) return 'no-track'
  const t = trackOf(r)
  if (t && ctx.majority && trackSignature(t) !== ctx.majority) return 'odd-track'
  if (ctx.series && (r.season === null || r.episode === null)) return 'no-episode'
  return null
}
