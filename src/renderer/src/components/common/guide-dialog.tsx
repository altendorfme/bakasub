import { lazy, Suspense, useState } from 'react'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { GuideId } from '@renderer/guides/guides'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@renderer/components/ui/dialog'

// react-markdown is only needed once a guide is opened.
const GuideView = lazy(async () => ({ default: (await import('./guide-view')).GuideView }))

/** "How to get one" link that opens a bundled guide; links between guides navigate inside. */
export function GuideDialog({ id, label }: { id: GuideId; label?: string }): React.JSX.Element {
  const { t } = useTranslation()
  const [stack, setStack] = useState<GuideId[]>([id])
  const current = stack[stack.length - 1]
  return (
    <Dialog onOpenChange={(open) => open && setStack([id])}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-primary">
          <BookOpen />
          {label ?? t('keyForm.howTo')}
        </Button>
      </DialogTrigger>
      <DialogContent title={t(`guides.${current}`)} className="w-[min(44rem,calc(100vw-2rem))]">
        {stack.length > 1 ? (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => setStack((s) => s.slice(0, -1))}
          >
            <ArrowLeft />
            {t('actions.back')}
          </Button>
        ) : null}
        <Suspense fallback={null}>
          <GuideView id={current} onNavigate={(next) => setStack((s) => [...s, next])} />
        </Suspense>
      </DialogContent>
    </Dialog>
  )
}
