import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { Preset, PresetImportResult, PresetInput } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

export const usePresets = (): UseQueryResult<Preset[]> =>
  useQuery({ queryKey: qk.presets.list(), queryFn: () => unwrap(window.api.presets.list()) })

/** Every preset mutation answers with fresh data; the list is simply refetched. */
function usePresetMutation<V, R>(fn: (v: V) => Promise<R>): UseMutationResult<R, Error, V> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.presets.list() })
  })
}

export const useSavePreset = (): UseMutationResult<
  Preset,
  Error,
  { id: string | null; input: PresetInput }
> =>
  usePresetMutation(({ id, input }) =>
    unwrap(id ? window.api.presets.update(id, input) : window.api.presets.create(input))
  )

export const useDuplicatePreset = (): UseMutationResult<
  Preset,
  Error,
  { id: string; name: string }
> => usePresetMutation(({ id, name }) => unwrap(window.api.presets.duplicate(id, name)))

export const useDeletePreset = (): UseMutationResult<{ deleted: true }, Error, string> =>
  usePresetMutation((id) => unwrap(window.api.presets.delete(id)))

export const useImportPresets = (): UseMutationResult<
  PresetImportResult,
  Error,
  'rename' | 'skip'
> => usePresetMutation((onConflict) => unwrap(window.api.presets.import(onConflict)))

export const useExportPresets = (): UseMutationResult<
  { path: string | null; count: number },
  Error,
  string[]
> => useMutation({ mutationFn: (ids) => unwrap(window.api.presets.export(ids)) })
