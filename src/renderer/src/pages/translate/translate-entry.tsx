import { usePageState } from '@renderer/lib/page-state'
import { BatchWizard } from './batch/batch-wizard'
import { TranslatePage } from './translate-page'

type Mode = 'single' | 'many'

/**
 * Translate opens straight on the single-file wizard. The first step of each wizard carries a
 * button that switches to the other mode (single ⇄ several files / folder).
 */
export function TranslateEntry(): React.JSX.Element {
  const [mode, setMode] = usePageState<Mode>('translate.mode', 'single')
  if (mode === 'many') return <BatchWizard onSwitchMode={() => setMode('single')} />
  return <TranslatePage onSwitchMode={() => setMode('many')} />
}
