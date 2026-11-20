import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Preset } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

export const usePresets = (): UseQueryResult<Preset[]> =>
  useQuery({ queryKey: qk.presets.list(), queryFn: () => unwrap(window.api.presets.list()) })
