import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { MemoryPruneResult, MemoryPruneScope, MemoryStats } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

export const useMemoryStats = (): UseQueryResult<MemoryStats> =>
  useQuery({ queryKey: qk.memory.stats(), queryFn: () => unwrap(window.api.memory.stats()) })

/** Refused with `MEMORY_BUSY` while a job runs; the UI disables it first. */
export function usePruneMemory(): UseMutationResult<MemoryPruneResult, Error, MemoryPruneScope> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scope) => unwrap(window.api.memory.prune(scope)),
    onSuccess: (r) => qc.setQueryData(qk.memory.stats(), r.stats)
  })
}
