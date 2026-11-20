import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { FreeQuotaStatus, ModelList, ModelSummary } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

/** Catalog cached 24 h by the Main; here it only needs to survive navigation. */
export const useModels = (): UseQueryResult<ModelList> =>
  useQuery({
    queryKey: qk.models.list(),
    queryFn: () => unwrap(window.api.models.list()),
    staleTime: 60 * 60 * 1000
  })

export const useFreeQuota = (enabled = true): UseQueryResult<FreeQuotaStatus> =>
  useQuery({
    queryKey: qk.models.freeQuota(),
    queryFn: () => unwrap(window.api.models.freeQuota()),
    staleTime: 30_000,
    enabled
  })

/** Same rule as the Main (`laneOf`): `:free` variants or zero price. */
export const isFreeModel = (m: Pick<ModelSummary, 'id' | 'pricing'>): boolean =>
  m.id.endsWith(':free') ||
  (m.pricing !== null && m.pricing.prompt === 0 && m.pricing.completion === 0)
