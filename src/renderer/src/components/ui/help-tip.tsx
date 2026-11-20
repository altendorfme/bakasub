import { CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip } from './popover'

/**
 * "?" next to a label that explains the field on hover or keyboard focus. The explanation is
 * also the button's accessible description, so screen readers get it without hovering.
 */
export function HelpTip({ children }: { children: ReactNode }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Tooltip content={<span className="block max-w-72 leading-relaxed">{children}</span>}>
      <button
        type="button"
        aria-label={t('help.label')}
        className="inline-grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
        onClick={(e) => e.preventDefault()}
      >
        <CircleHelp className="size-3.5" />
      </button>
    </Tooltip>
  )
}
