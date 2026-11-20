import { usePageState } from '@renderer/lib/page-state'
import { ExtractBatchWizard } from './batch/extract-batch-wizard'
import { ExtractPage } from './extract-page'

type Mode = 'single' | 'many'

/** Same pattern as Translate: opens on the single-file form, with a button to the batch mode. */
export function ExtractEntry(): React.JSX.Element {
  const [mode, setMode] = usePageState<Mode>('extract.mode', 'single')
  if (mode === 'many') return <ExtractBatchWizard onSwitchMode={() => setMode('single')} />
  return <ExtractPage onSwitchMode={() => setMode('many')} />
}
