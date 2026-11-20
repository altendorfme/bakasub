import { useState } from 'react'

/**
 * Media artwork behind a screen (wizard, queue). Panels on top stay ~92% opaque, never
 * transparent. Fades in once loaded; a missing or failed image simply shows nothing.
 */
export function Backdrop({ url }: { url: string | undefined }): React.JSX.Element | null {
  const [loaded, setLoaded] = useState<string | null>(null)
  if (!url) return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <img
        key={url}
        src={url}
        alt=""
        onLoad={() => setLoaded(url)}
        className="h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none"
        style={{ opacity: loaded === url ? 0.55 : 0 }}
      />
      <div className="absolute inset-0 bg-linear-to-b from-background/40 via-background/75 to-background" />
    </div>
  )
}
