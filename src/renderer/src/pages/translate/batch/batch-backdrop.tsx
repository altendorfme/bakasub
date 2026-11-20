import { useQueries } from '@tanstack/react-query'
import type { MediaRef } from '@shared/ipc-contract'
import { Backdrop } from '@renderer/components/media/backdrop'
import { qk } from '@renderer/data/query-keys'
import { unwrap } from '@renderer/lib/ipc'

/**
 * Artwork of one of the batch's works, drawn again on every step (`draw` in [0, 1)). Same
 * `Backdrop` as the single-file wizard; the works' details share its cache.
 */
export function BatchBackdrop({
  refs,
  draw
}: {
  refs: readonly MediaRef[]
  draw: number
}): React.JSX.Element | null {
  const res = useQueries({
    queries: refs.map((ref) => ({
      queryKey: qk.media.lookup(ref.kind, ref.id, 0, 0),
      queryFn: () => unwrap(window.api.media.lookup(ref)),
      staleTime: Infinity
    }))
  })
  const urls = [
    ...new Set(
      res.flatMap((r) => (r.data?.details.backdropUrl ? [r.data.details.backdropUrl] : []))
    )
  ]
  if (!urls.length) return null
  return <Backdrop url={urls[Math.floor(draw * urls.length) % urls.length]} />
}
