import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AppInfo, AppUpdateInfo } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

export const useAppInfo = (): UseQueryResult<AppInfo> =>
  useQuery({ queryKey: qk.app.info(), queryFn: () => unwrap(window.api.app.getInfo()) })

export const useAppUpdate = (): UseQueryResult<AppUpdateInfo> =>
  useQuery({
    queryKey: qk.app.update(),
    queryFn: () => unwrap(window.api.app.checkUpdate()),
    staleTime: 6 * 60 * 60 * 1000
  })
