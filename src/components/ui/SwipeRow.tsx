import { useRef, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { Check, Trash2 } from 'lucide-react'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'

export interface SwipeRowProps {
  children: ReactNode
  /** Swipe right → complete. */
  onComplete?: () => void
  /** Swipe left → delete (caller should offer undo via toast). */
  onDelete?: () => void
  completeLabel?: string
  className?: string
}

const THRESHOLD = 88

/** Row with swipe gestures for mobile. Taps still go to children. */
export function SwipeRow({ children, onComplete, onDelete, completeLabel = 'Concluir', className }: SwipeRowProps) {
  const x = useMotionValue(0)
  const crossed = useRef(false)
  const leftOpacity = useTransform(x, [0, THRESHOLD], [0, 1])
  const rightOpacity = useTransform(x, [-THRESHOLD, 0], [1, 0])

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      {onComplete && (
        <motion.div style={{ opacity: leftOpacity }} className="absolute inset-0 flex items-center pl-5 bg-sage text-bg rounded-2xl">
          <Check size={20} />
          <span className="ml-2 text-sm font-medium">{completeLabel}</span>
        </motion.div>
      )}
      {onDelete && (
        <motion.div style={{ opacity: rightOpacity }} className="absolute inset-0 flex items-center justify-end pr-5 bg-accent text-bg rounded-2xl">
          <span className="mr-2 text-sm font-medium">Apagar</span>
          <Trash2 size={18} />
        </motion.div>
      )}
      <motion.div
        style={{ x, touchAction: 'pan-y' }}
        drag={onComplete || onDelete ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: onDelete ? -160 : 0, right: onComplete ? 160 : 0 }}
        dragElastic={0.15}
        onDrag={(_, info) => {
          const over = Math.abs(info.offset.x) > THRESHOLD
          if (over && !crossed.current) haptic('light')
          crossed.current = over
        }}
        onDragEnd={(_, info) => {
          crossed.current = false
          if (info.offset.x > THRESHOLD && onComplete) onComplete()
          else if (info.offset.x < -THRESHOLD && onDelete) {
            animate(x, -500, { duration: 0.2 })
            setTimeout(onDelete, 160)
            return
          }
          animate(x, 0, { type: 'spring', bounce: 0.2, duration: 0.35 })
        }}
        className="relative bg-surface"
      >
        {children}
      </motion.div>
    </div>
  )
}
