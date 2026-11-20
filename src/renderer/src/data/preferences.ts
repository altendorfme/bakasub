import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { PublicSettings } from '@shared/ipc-contract'
import { errorMessage } from '@renderer/i18n/error-message'
import type { ListWithDefault } from '@renderer/lib/favorites'
import { qk } from './query-keys'
import { useSettings, useUpdateSettings } from './settings'

type ListKey = 'models.favorites' | 'translation.targetLangs'
type DefaultKey = 'translation.defaultModel' | 'translation.defaultTargetLang'

/**
 * A setting list plus its default as one value (model favorites, target languages). Changes are
 * optimistic: the cache updates at once, and an error from the Main rolls it back with a toast.
 */
export function useListWithDefault(
  listKey: ListKey,
  defaultKey: DefaultKey
): { value: ListWithDefault; onChange: (next: ListWithDefault) => void; ready: boolean } {
  const qc = useQueryClient()
  const settings = useSettings()
  const update = useUpdateSettings()
  const s = settings.data
  const value: ListWithDefault = {
    list: s?.[listKey] ?? [],
    default: (s?.[defaultKey] as string | null | undefined) ?? null
  }
  const onChange = (next: ListWithDefault): void => {
    const before = qc.getQueryData<PublicSettings>(qk.settings.all())
    const patch = {
      [listKey]: [...next.list],
      [defaultKey]: next.default
    } as Partial<PublicSettings>
    if (before) qc.setQueryData(qk.settings.all(), { ...before, ...patch })
    update.mutate(patch, {
      onError: (err) => {
        if (before) qc.setQueryData(qk.settings.all(), before)
        toast.error(errorMessage(err))
      }
    })
  }
  return { value, onChange, ready: !!s }
}

/**
 * One public setting as `[value, set]`. Saves at once; an error from the Main (range, conflict)
 * shows a toast and the cache keeps the last valid snapshot.
 */
export function useSetting<K extends keyof PublicSettings>(
  key: K
): [PublicSettings[K] | undefined, (value: PublicSettings[K]) => void] {
  const settings = useSettings()
  const update = useUpdateSettings()
  const set = (value: PublicSettings[K]): void =>
    update.mutate({ [key]: value } as Partial<PublicSettings>, {
      onError: (err) => toast.error(errorMessage(err))
    })
  return [settings.data?.[key], set]
}
