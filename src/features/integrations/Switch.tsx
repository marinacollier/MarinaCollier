import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'

/** iOS-style switch with a 44px hit area. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic('light')
        onChange(!checked)
      }}
      className="h-11 -my-1.5 -mr-1 px-1 inline-flex items-center shrink-0 disabled:opacity-40"
    >
      <span className={cn('relative inline-flex h-[30px] w-[50px] rounded-full transition-colors duration-200', checked ? 'bg-sage' : 'bg-line')}>
        <motion.span
          className="absolute top-[3px] h-6 w-6 rounded-full bg-surface shadow-card"
          initial={false}
          animate={{ left: checked ? 23 : 3 }}
          transition={{ type: 'spring', bounce: 0.25, duration: 0.3 }}
        />
      </span>
    </button>
  )
}
