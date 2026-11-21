import { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { usePageState } from '@renderer/lib/page-state'
import { BatchWizard } from './batch/batch-wizard'
import { TranslatePage } from './translate-page'

type Mode = 'single' | 'many'

/**
 * Translate opens straight on the single-file wizard. The first step of each wizard carries a
 * button that switches to the other mode (single ⇄ several files / folder). `?batch=<id>` (a
 * click on a batch notification) opens that batch's progress in the several-files mode.
 */
export function TranslateEntry(): React.JSX.Element {
  const [mode, setMode] = usePageState<Mode>('translate.mode', 'single')
  const [, setBatchId] = usePageState<string | null>('translate.batch.id', null)
  const { batch } = useSearch({ from: '/shell/translate' })
  const navigate = useNavigate({ from: '/translate' })
  useEffect(() => {
    if (!batch) return
    setMode('many')
    setBatchId(batch)
    void navigate({ search: {}, replace: true })
  }, [batch, setMode, setBatchId, navigate])
  if (mode === 'many') return <BatchWizard onSwitchMode={() => setMode('single')} />
  return <TranslatePage onSwitchMode={() => setMode('many')} />
}
