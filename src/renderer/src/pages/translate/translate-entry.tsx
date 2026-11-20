import { useState } from 'react'
import { FileVideo, FolderTree } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BatchWizard } from './batch/batch-wizard'
import { TranslatePage } from './translate-page'

type Mode = 'single' | 'many'

/** Translate starts with a choice: one file (the wizard) or several files / a folder (batch). */
export function TranslateEntry(): React.JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode | null>(null)
  if (mode === 'single') return <TranslatePage onBack={() => setMode(null)} />
  if (mode === 'many') return <BatchWizard onBack={() => setMode(null)} />
  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-6 py-10">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('nav.translate')}</h1>
        <p className="text-sm text-muted-foreground">{t('choose.heading')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice
          icon={<FileVideo className="size-10" />}
          title={t('choose.single')}
          body={t('choose.singleBody')}
          onClick={() => setMode('single')}
        />
        <Choice
          icon={<FolderTree className="size-10" />}
          title={t('choose.many')}
          body={t('choose.manyBody')}
          onClick={() => setMode('many')}
        />
      </div>
    </div>
  )
}

function Choice({
  icon,
  title,
  body,
  onClick
}: {
  icon: React.ReactNode
  title: string
  body: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group grid aspect-[4/3] content-center justify-items-center gap-3 rounded-2xl border-2 bg-card/92 p-8 text-center transition-colors hover:border-primary/70 hover:bg-primary-soft/30 focus-visible:border-primary focus-visible:outline-none"
    >
      <span className="text-violet transition-colors group-hover:text-primary" aria-hidden>
        {icon}
      </span>
      <span className="text-lg font-semibold">{title}</span>
      <span className="max-w-[34ch] text-sm text-muted-foreground">{body}</span>
    </button>
  )
}
