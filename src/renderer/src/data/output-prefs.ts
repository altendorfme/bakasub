import type { ExtractNaming, OutputMode } from '@shared/ipc-contract'
import { useSettings, useUpdateSettings } from './settings'

/** Last output choices, remembered in Settings; the wizards follow them until the user picks. */
export function useOutputPrefs(): {
  mode: OutputMode
  naming: ExtractNaming
  remember: (patch: { mode?: OutputMode; naming?: ExtractNaming }) => void
} {
  const settings = useSettings().data
  const { mutate } = useUpdateSettings()
  const mode = settings?.['output.mode'] ?? 'mux'
  const naming = settings?.['output.extractNaming'] ?? 'player'
  return {
    mode,
    naming,
    remember: (patch) => {
      const next = {
        ...(patch.mode && patch.mode !== mode ? { 'output.mode': patch.mode } : {}),
        ...(patch.naming && patch.naming !== naming ? { 'output.extractNaming': patch.naming } : {})
      }
      if (Object.keys(next).length) mutate(next)
    }
  }
}
