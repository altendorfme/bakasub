import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@renderer/lib/utils'

/** Two-thumb slider over integer steps (the caller maps steps to values). Keyboard: arrows. */
export function RangeSlider({
  max,
  value,
  onChange,
  labels,
  className
}: {
  /** Last step index (steps are 0..max). */
  max: number
  value: [number, number]
  onChange: (v: [number, number]) => void
  /** Accessible names of the two thumbs. */
  labels: [string, string]
  className?: string
}): React.JSX.Element {
  return (
    <SliderPrimitive.Root
      min={0}
      max={max}
      step={1}
      minStepsBetweenThumbs={0}
      value={value}
      onValueChange={(v) => onChange([v[0], v[1]])}
      className={cn('relative flex h-5 w-full touch-none items-center select-none', className)}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-linear-to-r from-primary to-violet" />
      </SliderPrimitive.Track>
      {labels.map((label) => (
        <SliderPrimitive.Thumb
          key={label}
          aria-label={label}
          className="block size-4 cursor-grab rounded-full border-2 border-primary bg-background shadow transition-transform hover:scale-110 active:cursor-grabbing"
        />
      ))}
    </SliderPrimitive.Root>
  )
}
