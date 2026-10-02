import { cn } from '@/lib/cn'
import { clampProgress } from '../selectors'

/** Native range (thumb is easy to grab on iPhone), tinted with the accent token. Steps of 5%. */
export function ProgressSlider({ value, onChange, onCommit, className, label = 'Progresso' }: { value: number; onChange: (v: number) => void; onCommit?: (v: number) => void; className?: string; label?: string }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      aria-label={label}
      value={clampProgress(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onTouchEnd={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      className={cn('w-full h-11 cursor-pointer [accent-color:var(--accent)]', className)}
    />
  )
}
