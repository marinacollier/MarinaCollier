import { AnimatePresence, motion } from 'framer-motion'
import { dismissToast, useUI } from '@/app/ui-store'
import { cn } from '@/lib/cn'

export function Toaster() {
  const toasts = useUI((s) => s.toasts)
  // Above the "+" (bottom-right) on pages; at the top while a sheet is open, so it never covers a form or its button.
  const sheetOpen = useUI((s) => s.sheets.length > 0)
  const place = sheetOpen ? { top: 'calc(env(safe-area-inset-top) + 12px)' } : { bottom: 'calc(env(safe-area-inset-bottom) + 148px)' }
  return (
    <div className="fixed left-0 right-0 z-[90] flex flex-col items-center gap-2 px-4 pointer-events-none" style={place} aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-full pl-5 pr-1 min-h-12 shadow-xl max-w-[440px]',
              t.tone === 'win' ? 'bg-accent text-bg' : 'bg-ink text-bg',
            )}
          >
            <span className="text-[14px] py-2">{t.message}</span>
            {t.action ? (
              <button
                className="h-11 min-w-11 px-4 rounded-full bg-bg/15 text-[0.8125rem] font-semibold"
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-3" />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
