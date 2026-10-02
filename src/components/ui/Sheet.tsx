import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useDragControls, type PanInfo } from 'framer-motion'
import { Trash2, X } from 'lucide-react'
import { useKeyboardInset } from '@/hooks/useKeyboardInset'
import { cn } from '@/lib/cn'
import { Button, IconButton } from './Button'

/**
 * Bottom sheet frame (used by the SheetHost; feature code uses <SheetLayout/>).
 * Drag the handle down to dismiss. Max height 92dvh, scrolls internally, lifts above the keyboard.
 */
export function SheetFrame({ onClose, children, depth = 0, isTop = true }: { onClose: () => void; children: ReactNode; depth?: number; isTop?: boolean }) {
  const controls = useDragControls()
  const kb = useKeyboardInset()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Only the top sheet reacts to Esc, so stacked sheets close one at a time.
    if (!isTop) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, isTop])

  return (
    <div className="fixed inset-0 z-50" style={{ zIndex: 50 + depth }} role="dialog" aria-modal="true">
      <motion.div
        className="absolute inset-0 bg-[#1e1a16]/35 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        ref={ref}
        className="absolute left-0 right-0 bottom-0 mx-auto max-w-[560px] bg-surface rounded-t-[28px] shadow-2xl flex flex-col"
        style={{ maxHeight: `calc(92dvh - ${kb}px)`, bottom: kb }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 34, stiffness: 380 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info: PanInfo) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose()
        }}
      >
        <div className="pt-2.5 pb-1 flex justify-center touch-none cursor-grab" onPointerDown={(e) => controls.start(e)}>
          <div className="h-1.5 w-10 rounded-full bg-line" />
        </div>
        {children}
      </motion.div>
    </div>
  )
}

export interface SheetLayoutProps {
  title?: ReactNode
  /** Small text above the title. */
  eyebrow?: ReactNode
  children: ReactNode
  /** Main action at the bottom ("Salvar"). */
  primary?: { label: string; onClick: () => void; disabled?: boolean }
  /** Optional delete in the header (asks for a second tap). */
  onDelete?: () => void
  onClose: () => void
  /** Extra footer content to the left of the primary button. */
  footerExtra?: ReactNode
  className?: string
}

/** Standard content layout for every sheet: header, scrollable body, sticky footer. */
export function SheetLayout({ title, eyebrow, children, primary, onDelete, onClose, footerExtra, className }: SheetLayoutProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-5 pb-2">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          {title && <h2 className="font-display text-[22px] leading-tight truncate">{title}</h2>}
        </div>
        <div className="flex items-center -mr-2">
          {onDelete && <DeleteButton onConfirm={onDelete} />}
          <IconButton label="Fechar" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
      </div>
      <div className={cn('flex-1 overflow-y-auto overscroll-contain px-5 pb-4 space-y-4', className)}>{children}</div>
      {(primary || footerExtra) && (
        <div className="px-5 pt-3 border-t border-line/70 flex items-center gap-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          {footerExtra}
          {primary && (
            <Button variant="primary" size="lg" className="flex-1" onClick={primary.onClick} disabled={primary.disabled}>
              {primary.label}
            </Button>
          )}
        </div>
      )}
    </>
  )
}

/** Two-tap delete: first tap arms, second confirms. */
export function DeleteButton({ onConfirm, label = 'Apagar' }: { onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 2500)
    return () => clearTimeout(t)
  }, [armed])
  if (armed)
    return (
      <Button variant="danger" size="sm" onClick={onConfirm}>
        Apagar mesmo?
      </Button>
    )
  return (
    <IconButton label={label} onClick={() => setArmed(true)}>
      <Trash2 size={18} />
    </IconButton>
  )
}
