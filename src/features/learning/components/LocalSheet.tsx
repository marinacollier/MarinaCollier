import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'framer-motion'
import { SheetFrame } from '@/components/ui'

/**
 * A bottom sheet owned by a page (not in the global registry): "E depois?", track editor,
 * capa, avaliação. Portaled to <body> so page transforms never trap the fixed layer.
 */
export function LocalSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <SheetFrame onClose={onClose} depth={4}>
          {children}
        </SheetFrame>
      )}
    </AnimatePresence>,
    document.body,
  )
}
