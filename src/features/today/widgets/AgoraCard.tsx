import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { pickAgora } from '../agora'
import { runAction, type WidgetCtx } from './shared'

export function AgoraCard({ ctx }: { ctx: WidgetCtx }) {
  const nav = useNavigate()
  const pick = useMemo(() => pickAgora(ctx.db, ctx.today, ctx.minutes), [ctx.db, ctx.today, ctx.minutes])
  const isNow = pick.label === 'Agora' && pick.reason !== 'fallback'
  return (
    <section id="w-agora" className="scroll-mt-4">
      <button
        type="button"
        onClick={() => {
          haptic('light')
          runAction(pick.action, nav)
        }}
        className={cn(
          'relative w-full text-left rounded-[26px] p-5 pr-16 overflow-hidden active:scale-[0.99] transition',
          'bg-ink text-bg dark:bg-surface-2 dark:text-ink',
        )}
      >
        {/* soft glow, token-based */}
        <span aria-hidden className="pointer-events-none absolute -top-16 -right-14 h-44 w-44 rounded-full bg-accent/25 blur-2xl" />
        <span className="relative flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-semibold opacity-80">
          <span className="relative flex h-2 w-2">
            {isNow && <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 animate-ping" />}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          {pick.label}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${pick.reason}-${pick.title}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="relative flex items-start gap-3.5 mt-3"
          >
            <span className="text-[34px] leading-none mt-0.5 shrink-0" aria-hidden>
              {pick.emoji}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-display text-[25px] leading-[1.12] tracking-tight">{pick.title}</span>
              {pick.subtitle && <span className="block text-[14px] opacity-70 mt-1.5 leading-snug">{pick.subtitle}</span>}
            </span>
          </motion.span>
        </AnimatePresence>
        <span className="absolute right-4 bottom-4">
          <span className="h-9 w-9 rounded-full bg-bg/15 dark:bg-ink/10 inline-flex items-center justify-center">
            <ArrowRight size={17} />
          </span>
        </span>
      </button>
    </section>
  )
}
