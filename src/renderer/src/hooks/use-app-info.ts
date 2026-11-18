import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { unwrap } from '@renderer/lib/ipc'
import type { AppInfo } from '@shared/ipc-contract'

export const useAppInfo = (): UseQueryResult<AppInfo> =>
  useQuery({ queryKey: ['app', 'info'], queryFn: () => unwrap(window.api.app.getInfo()) })
