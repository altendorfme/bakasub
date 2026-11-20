import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  Batch,
  BatchCreateRequest,
  BatchMuxPlan,
  BatchPlan,
  BatchPlanItem,
  BatchSource,
  MediaIdentification
} from '@shared/ipc-contract'
import { sourceKindOf } from '@shared/file-types'
import { unwrap } from '@renderer/lib/ipc'
import { useJobs } from './jobs'
import { qk } from './query-keys'

type Flavor = 'pipeline' | 'translate' | 'extract'
const KIND_OF: Record<Flavor, 'video' | 'subtitle'> = {
  pipeline: 'video',
  translate: 'subtitle',
  extract: 'video'
}

/** The source as each plan needs it: loose files are split by type; a folder is scanned twice. */
function sourceFor(flavor: Flavor, source: BatchSource): BatchSource | null {
  if (source.type === 'folder') return source
  const paths = source.paths.filter((p) => sourceKindOf(p) === KIND_OF[flavor])
  return paths.length ? { type: 'files', paths } : null
}

/**
 * Both plans of the translate flow: videos (`pipeline`) and subtitle files (`translate`), so a
 * folder with both lets the user pick. Probing is cached for the session.
 */
export function useBatchPlans(source: BatchSource | null): {
  pipeline?: BatchPlan
  translate?: BatchPlan
  pending: boolean
  error: Error | null
} {
  const q = (['pipeline', 'translate'] as const).map((flavor) => {
    const src = source ? sourceFor(flavor, source) : null
    return {
      queryKey: qk.batches.plan(flavor, src),
      queryFn: () => unwrap(window.api.batches.plan({ kind: flavor, source: src! })),
      enabled: src !== null,
      staleTime: Infinity
    }
  })
  const [pipeline, translate] = useQueries({ queries: q })
  return {
    pipeline: pipeline.data,
    translate: translate.data,
    pending: (q[0].enabled && pipeline.isPending) || (q[1].enabled && translate.isPending),
    error: pipeline.error ?? translate.error
  }
}

/** The plan of an extract batch: only videos count (loose files of other types are dropped). */
export function useExtractPlan(source: BatchSource | null): UseQueryResult<BatchPlan | null> {
  const src = source ? sourceFor('extract', source) : null
  return useQuery({
    queryKey: qk.batches.plan('extract', src),
    queryFn: () => unwrap(window.api.batches.plan({ kind: 'extract', source: src! })),
    enabled: src !== null,
    staleTime: Infinity
  })
}

/** The plan of a mux batch: MKVs and subtitle files, paired by the Main (loose files of other types are dropped). */
export function useMuxPlan(source: BatchSource | null): UseQueryResult<BatchMuxPlan | null> {
  const src =
    source?.type === 'files'
      ? ((paths) => (paths.length ? { type: 'files' as const, paths } : null))(
          source.paths.filter((p) => sourceKindOf(p) !== null)
        )
      : source
  return useQuery({
    queryKey: qk.batches.plan('mux', src),
    queryFn: () => unwrap(window.api.batches.plan({ kind: 'mux', source: src! })),
    enabled: src !== null,
    staleTime: Infinity
  })
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p

/** `media:identify` for every file (same cache as the single-file wizard). */
export function useIdentifyAll(items: readonly BatchPlanItem[]): {
  data: (MediaIdentification | undefined)[]
  settled: boolean
} {
  const res = useQueries({
    queries: items.map((it) => ({
      queryKey: qk.media.identify(baseName(it.path)),
      queryFn: () => unwrap(window.api.media.identify(baseName(it.path))),
      staleTime: Infinity
    }))
  })
  return { data: res.map((r) => r.data), settled: res.every((r) => !r.isPending) }
}

export function useCreateBatch(): UseMutationResult<Batch, Error, BatchCreateRequest> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req) => unwrap(window.api.batches.create(req)),
    // The jobs were created by the Main: the list must be read again.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.jobs.list() })
  })
}

/** Live: refetched whenever the status of one of its jobs changes (the jobs list is live). */
export function useBatch(id: string | null): UseQueryResult<Batch> {
  const jobs = useJobs().data ?? []
  const statuses = jobs
    .filter((j) => j.batchId === id)
    .map((j) => `${j.id}:${j.status}`)
    .join(',')
  return useQuery({
    queryKey: qk.batches.detail(id ?? '', statuses),
    queryFn: () => unwrap(window.api.batches.get(id!)),
    enabled: id !== null,
    placeholderData: keepPreviousData
  })
}

export function useBatchAction(): UseMutationResult<
  Batch,
  Error,
  { id: string; action: 'confirm' | 'cancel' }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }) => unwrap(window.api.batches[action](id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.jobs.list() })
  })
}
