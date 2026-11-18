import { useEffect, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  AppUpdateInfo,
  SidecarInstallResult,
  SidecarProgress,
  SidecarReport
} from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'

export const useSidecarReport = (): UseQueryResult<SidecarReport> =>
  useQuery({ queryKey: ['sidecars', 'report'], queryFn: () => unwrap(window.api.sidecars.check()) })

export const useAppUpdate = (): UseQueryResult<AppUpdateInfo> =>
  useQuery({
    queryKey: ['app', 'update'],
    queryFn: () => unwrap(window.api.app.checkUpdate()),
    staleTime: 6 * 60 * 60 * 1000
  })

/** O diálogo de consentimento é nativo (Main); aqui só disparamos o pedido. */
export function useInstallSidecars(): UseMutationResult<SidecarInstallResult, Error, string[]> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tools: string[]) => unwrap(window.api.sidecars.install(tools)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['sidecars', 'report'] })
  })
}

export function useSidecarProgress(): Record<string, SidecarProgress> {
  const [byArchive, setByArchive] = useState<Record<string, SidecarProgress>>({})
  useEffect(
    () =>
      window.api.events.on('sidecars:progress', (p) =>
        setByArchive((prev) => ({ ...prev, [p.archive]: p }))
      ),
    []
  )
  return byArchive
}
