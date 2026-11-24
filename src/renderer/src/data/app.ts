import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { useEffect } from 'react'
import type { AppInfo, AppUpdateStatus } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

export const useAppInfo = (): UseQueryResult<AppInfo> =>
  useQuery({ queryKey: qk.app.info(), queryFn: () => unwrap(window.api.app.getInfo()) })

/** `BakaSub (dev)` for an unpackaged build, so it never passes for the installed app. */
export const appDisplayName = (info: Pick<AppInfo, 'name' | 'isDev'>): string =>
  info.isDev ? `${info.name} (dev)` : info.name

/** `0.4.0-dev` for an unpackaged build; the installed version is shown as is. */
export const appDisplayVersion = (info: Pick<AppInfo, 'version' | 'isDev'>): string =>
  info.isDev ? `${info.version}-dev` : info.version

/**
 * Snapshot of the updater (no network). It is read once on mount; every later change arrives as
 * the `app:update-state` event, which patches this cache (see `useAppUpdateEvents`): no polling.
 */
export const useAppUpdateStatus = (): UseQueryResult<AppUpdateStatus> =>
  useQuery({
    queryKey: qk.app.update(),
    queryFn: () => unwrap(window.api.app.getUpdateState()),
    staleTime: Infinity
  })

/** Subscribes once (at the root) to the updater events and writes them into the cache. */
export function useAppUpdateEvents(queryClient: QueryClient): void {
  useEffect(
    () =>
      window.api.events.on('app:update-state', (status) =>
        queryClient.setQueryData(qk.app.update(), status)
      ),
    [queryClient]
  )
}

/** "Check for updates": the result also arrives as an event, the response just seeds the cache. */
export function useCheckUpdate(): UseMutationResult<unknown, Error, void> {
  return useMutation({ mutationFn: () => unwrap(window.api.app.checkUpdate()) })
}

export function useDownloadUpdate(): UseMutationResult<AppUpdateStatus, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(window.api.app.downloadUpdate()),
    onSuccess: (s) => qc.setQueryData(qk.app.update(), s)
  })
}

export function useCancelUpdateDownload(): UseMutationResult<{ cancelled: boolean }, Error, void> {
  return useMutation({ mutationFn: () => unwrap(window.api.app.cancelUpdateDownload()) })
}

/** `confirmJobs` lets the Main abort running jobs; without it the Main answers UPDATE_JOBS_ACTIVE. */
export function useInstallUpdate(): UseMutationResult<
  { installing: true },
  Error,
  { confirmJobs?: boolean } | void
> {
  return useMutation({ mutationFn: (opts) => unwrap(window.api.app.installUpdate(opts ?? {})) })
}

/** A version is ready to act on (shown as a discreet hint outside Settings). */
export const updatePending = (s: AppUpdateStatus | undefined): boolean =>
  s?.state === 'available' || s?.state === 'downloaded'
