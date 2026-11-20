import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'

const read = (key: string, fallback: number): number => {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}
const write = (key: string, v: number): void => {
  try {
    localStorage.setItem(key, String(v))
  } catch {
    // Storage blocked: the width just isn't remembered.
  }
}

/**
 * Side panel whose width the user drags (or sets with arrow keys on the handle). The width is a
 * per-machine convenience kept in localStorage.
 */
export function ResizableAside({
  storageKey,
  initial = 352,
  min = 260,
  max = 640,
  className,
  children
}: {
  storageKey: string
  initial?: number
  min?: number
  max?: number
  className?: string
  children: ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const clamp = (v: number): number => Math.min(max, Math.max(min, v))
  const [width, setWidth] = useState(() => clamp(read(storageKey, initial)))
  const drag = useRef<{ x: number; w: number } | null>(null)

  const set = (v: number): void => {
    const w = clamp(v)
    setWidth(w)
    write(storageKey, w)
  }
  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    drag.current = { x: e.clientX, w: width }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (drag.current) set(drag.current.w + e.clientX - drag.current.x)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowLeft') set(width - 16)
    if (e.key === 'ArrowRight') set(width + 16)
  }

  return (
    <aside className={cn('relative flex shrink-0 flex-col border-r', className)} style={{ width }}>
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('common.resize')}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={onKey}
        className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize hover:bg-primary/30 focus-visible:bg-primary/40"
      />
    </aside>
  )
}
