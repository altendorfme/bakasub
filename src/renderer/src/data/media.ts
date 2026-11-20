import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type {
  MediaContextLookup,
  MediaDetails,
  MediaIdentification,
  MediaProbe,
  MediaRef,
  MediaSearchResult,
  OpenDialogKind
} from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

/** Subtitle tracks of an MKV (the Main revalidates the path). */
export const useProbe = (path: string | null): UseQueryResult<MediaProbe> =>
  useQuery({
    queryKey: qk.media.probe(path ?? ''),
    queryFn: () => unwrap(window.api.media.probe(path!)),
    enabled: path !== null,
    staleTime: Infinity
  })

/** Native open dialog; `null` when cancelled. */
export async function pickFile(kind: OpenDialogKind): Promise<string | null> {
  const { paths } = await unwrap(window.api.dialog.openFiles(kind, false))
  return paths[0] ?? null
}

export async function pickOutputDir(): Promise<string | null> {
  return (await unwrap(window.api.dialog.chooseOutputDir())).path
}

/** Identification from the file name (nothing is read from disk). Stable: cached for the session. */
export const useIdentify = (name: string | null): UseQueryResult<MediaIdentification> =>
  useQuery({
    queryKey: qk.media.identify(name ?? ''),
    queryFn: () => unwrap(window.api.media.identify(name!)),
    enabled: name !== null,
    staleTime: Infinity
  })

/** TMDB search for the title field (debounce the query before passing it). */
export const useMediaSearch = (query: string): UseQueryResult<MediaSearchResult[]> =>
  useQuery({
    queryKey: qk.media.search(query),
    queryFn: () => unwrap(window.api.media.search(query)),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60 * 1000
  })

/** Details of the chosen title, plus the episode of a series when both numbers are set. */
export const useMediaLookup = (
  ref: MediaRef | null,
  episode: { season: number; episode: number } | null
): UseQueryResult<MediaContextLookup> =>
  useQuery({
    queryKey: qk.media.lookup(
      ref?.kind ?? '',
      ref?.id ?? 0,
      episode?.season ?? 0,
      episode?.episode ?? 0
    ),
    queryFn: () => unwrap(window.api.media.lookup(ref!, episode ?? undefined)),
    enabled: ref !== null,
    staleTime: Infinity,
    // Keep the details on screen while another episode loads.
    placeholderData: (prev) => (prev && ref && prev.details.id === ref.id ? prev : undefined)
  })

/** Details of several titles at once (same cache as `useMediaLookup` without an episode). */
export function useMediaDetailsMany(
  refs: readonly (MediaRef | null)[]
): (MediaDetails | undefined)[] {
  return useQueries({
    queries: refs.map((ref) => ({
      queryKey: qk.media.lookup(ref?.kind ?? '', ref?.id ?? 0, 0, 0),
      queryFn: () => unwrap(window.api.media.lookup(ref!, undefined)),
      enabled: ref !== null,
      staleTime: Infinity
    })),
    combine: (res) => res.map((r) => (r.data as MediaContextLookup | undefined)?.details)
  })
}
