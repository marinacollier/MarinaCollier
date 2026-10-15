import { Plus } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { openSheet, useUI } from '@/app/ui-store'
import { useKeyboardInset } from '@/hooks/useKeyboardInset'
import { haptic } from '@/lib/haptics'

/**
 * The one "+" of the app: bottom-right, above the nav, 56px. Opens the quick-add sheet (works without Lumos).
 * Steps aside while a sheet is open, while the keyboard is up, and on the Lumos page (it has its own composer).
 */
export function QuickAddFab() {
  const { pathname } = useLocation()
  const sheetOpen = useUI((s) => s.sheets.length > 0)
  const kb = useKeyboardInset()
  if (sheetOpen || kb > 0 || pathname.startsWith('/lumos') || pathname.startsWith('/ajustes')) return null
  return (
    <button
      type="button"
      aria-label="Registrar algo"
      onClick={() => {
        haptic('light')
        openSheet('quickAdd')
      }}
      className="fixed z-40 h-14 w-14 rounded-full bg-ink text-bg shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] inline-flex items-center justify-center active:scale-95 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={{ right: 'max(16px, calc(env(safe-area-inset-right) + 16px))', bottom: 'calc(env(safe-area-inset-bottom) + 60px + 16px)' }}
    >
      <Plus size={26} strokeWidth={2} aria-hidden />
    </button>
  )
}
