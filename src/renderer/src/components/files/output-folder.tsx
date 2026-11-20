import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { pickOutputDir } from '@renderer/data/media'

/** Output folder: `null` = next to the source file. */
export function OutputFolder({
  value,
  onChange
}: {
  value: string | null
  onChange: (dir: string | null) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 truncate rounded-md border bg-background/40 px-3 py-2 text-sm">
        {value ?? t('translate.output.nextToSource')}
      </span>
      <Button onClick={() => void pickOutputDir().then((d) => d && onChange(d))}>
        <FolderOpen />
        {t('translate.output.choose')}
      </Button>
      {value ? (
        <Button variant="ghost" onClick={() => onChange(null)}>
          {t('translate.output.reset')}
        </Button>
      ) : null}
    </div>
  )
}
