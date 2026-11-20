import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { guideIdFromHref, type GuideId } from '@renderer/guides/guides'
import { useGuide } from '@renderer/guides/use-guide'
import { reportError } from '@renderer/lib/report-error'

/**
 * Renders a bundled guide in the app language. Links to other guides call `onNavigate`;
 * every other link opens in the browser through the Main's allowlist (`app:open-external`).
 * No raw HTML is rendered (react-markdown default).
 */
export function GuideView({
  id,
  onNavigate,
  hideTitle = false
}: {
  id: GuideId
  onNavigate?: (id: GuideId) => void
  /** In a dialog the title is already the dialog's heading. */
  hideTitle?: boolean
}): React.JSX.Element {
  const guide = useGuide(id)
  const { t } = useTranslation()

  const components: Components = {
    ...(hideTitle ? { h1: () => null } : {}),
    a: ({ href = '', children }) => {
      const target = guideIdFromHref(href)
      if (target)
        return (
          <a
            href={href}
            className="text-primary underline underline-offset-2"
            onClick={(e) => {
              e.preventDefault()
              onNavigate?.(target)
            }}
          >
            {children}
          </a>
        )
      return (
        <a
          href={href}
          title={t('guides.openExternal')}
          className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2"
          onClick={(e) => {
            e.preventDefault()
            void window.api.app
              .openExternal(href)
              .then((r) => (r.ok ? undefined : reportError(new Error(r.error.code), 'promise')))
          }}
        >
          {children}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      )
    }
  }

  return (
    <article lang={guide.lang} className="guide text-sm leading-relaxed">
      {/* GFM: the guides use tables. */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {guide.markdown}
      </ReactMarkdown>
    </article>
  )
}
