import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'

export interface CheckboxProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  size?: 'sm' | 'md'
  className?: string
}

/** Round check with a soft draw-in animation. 44px hit area around a 24px circle. */
export function Checkbox({ checked, onChange, label, size = 'md', className }: CheckboxProps) {
  const dim = size === 'md' ? 24 : 20
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        if (!checked) haptic('light')
        onChange(!checked)
      }}
      className={cn('h-11 w-11 -m-2.5 inline-flex items-center justify-center shrink-0', className)}
    >
      <motion.span
        initial={false}
        animate={{ scale: checked ? [1, 0.85, 1.08, 1] : 1 }}
        transition={{ duration: 0.35 }}
        className={cn(
          'inline-flex items-center justify-center rounded-full border-[1.5px] transition-colors duration-200',
          checked ? 'bg-sage border-sage' : 'border-muted/60 bg-transparent',
        )}
        style={{ width: dim, height: dim }}
      >
        <svg viewBox="0 0 24 24" width={dim - 8} height={dim - 8} fill="none">
          <motion.path
            d="M5 12.5l4.2 4.2L19 7"
            stroke="white"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        </svg>
      </motion.span>
    </button>
  )
}
