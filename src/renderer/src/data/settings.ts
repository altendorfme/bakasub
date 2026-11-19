import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { ApiKeyStatus } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

export const useApiKeyStatus = (): UseQueryResult<ApiKeyStatus> =>
  useQuery({
    queryKey: qk.settings.apiKey(),
    queryFn: () => unwrap(window.api.settings.apiKeyStatus())
  })
