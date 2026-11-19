import { useEffect, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { SidecarInstallResult, SidecarProgress, SidecarReport } from '@shared/ipc-contract'
import { unwrap } from '@renderer/lib/ipc'
import { qk } from './query-keys'

export const useSidecarReport = (): UseQueryResult<SidecarReport> =>
  useQuery({ queryKey: qk.sidecars.report(), queryFn: () => unwrap(window.api.sidecars.check()) })

/** The consent dialog is native (Main); this only sends the request. */
export function useInstallSidecars(): UseMutationResult<SidecarInstallResult, Error, string[]> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tools: string[]) => unwrap(window.api.sidecars.install(tools)),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.sidecars.report() })
  })
}

/** Download/extract progress per archive, from `sidecars:progress`. */
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
