import { usePageState } from '@renderer/lib/page-state'
import { MuxBatchWizard } from './batch/mux-batch-wizard'
import { MuxPage } from './mux-page'

type Mode = 'single' | 'many'

/** Same pattern as Extract: opens on the single-file form, with a button to the batch mode. */
export function MuxEntry(): React.JSX.Element {
  const [mode, setMode] = usePageState<Mode>('mux.mode', 'single')
  if (mode === 'many') return <MuxBatchWizard onSwitchMode={() => setMode('single')} />
  return <MuxPage onSwitchMode={() => setMode('many')} />
}
