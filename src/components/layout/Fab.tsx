import { Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { openSheet } from '@/app/ui-store'
import { haptic } from '@/lib/haptics'

/** Global quick add. Sits above the bottom nav, inside the safe area. */
export function Fab() {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={() => {
        haptic('light')
        openSheet('quickAdd')
      }}
      aria-label="Adicionar"
      className="fixed z-40 right-4 h-14 w-14 rounded-full bg-accent text-white shadow-[0_10px_30px_-8px_rgb(194_88_47/0.6)] flex items-center justify-center md:right-[max(1rem,calc(50%-304px))]"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
    >
      <Plus size={26} strokeWidth={2.2} />
    </motion.button>
  )
}
