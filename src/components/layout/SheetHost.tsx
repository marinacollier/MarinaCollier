import { Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import { closeSheet, useUI } from '@/app/ui-store'
import { SHEETS } from '@/app/sheets'
import { SheetFrame } from '@/components/ui/Sheet'

/** Renders the sheet stack. Only the top sheet is interactive. */
export function SheetHost() {
  const sheets = useUI((s) => s.sheets)
  return (
    <AnimatePresence>
      {sheets.map((s, i) => {
        const Comp = SHEETS[s.name]
        return (
          <SheetFrame key={s.key} onClose={closeSheet} depth={i} isTop={i === sheets.length - 1}>
            <Suspense fallback={<div className="h-48" />}>
              <Comp {...(s.props as object)} />
            </Suspense>
          </SheetFrame>
        )
      })}
    </AnimatePresence>
  )
}
