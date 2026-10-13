/**
 * LumosSheet — Lumos answers on Home, in a bottom sheet over the page (the page behind never moves).
 *
 *   <LumosSheet request={{ n, text }} />            asks `text` and slides up (each new `n` asks again)
 *   <LumosSheet request={{ n, file, caption }} />   reads a print/PDF as one turn
 *
 * The sheet shows this session's conversation (./conversation.ts, the same talk as /lumos), scrolls
 * inside, and has its own composer docked at its bottom for follow-ups. When the latest sentence was
 * only a simple direct action (already saved, past tense + Desfazer), it folds after FOLD_MS into a
 * toast with Desfazer — unless she touched it. Confirmations, options, previews and lists stay open.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { SheetFrame } from '@/components/ui/Sheet'
import { toast } from '@/app/ui-store'
import { useDB, useStore } from '@/data/store'
import { useNow } from '@/hooks/useToday'
import { ask, canUndo, resolveWaiting, sendAttachment, undoReply, useConversation } from './conversation'
import { Composer, ExchangeView } from './LumosInline'
import { collapsible, latestGroup, toastText } from './sheet'
import type { LumosRequest } from '@/features/today/home/lumos'

export const FOLD_MS = 2500


export default function LumosSheet({ request }: { request?: LumosRequest }) {
  const db = useDB()
  const { today, minutes } = useNow()
  const hydrated = useStore((s) => s.hydrated)
  const exchanges = useConversation((s) => s.exchanges)
  const [open, setOpen] = useState(false)
  /** She touched the sheet: it stays open until she closes it. */
  const [held, setHeld] = useState(false)
  const handled = useRef<number | undefined>(undefined)
  const folded = useRef<number | undefined>(undefined)
  const bodyRef = useRef<HTMLDivElement>(null)
  const lastRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!request || handled.current === request.n) return
    handled.current = request.n
    setHeld(false)
    if (request.file) void sendAttachment(request.file, request.caption ?? '')
    else if (request.text?.trim()) ask(request.text)
    setOpen(true)
  }, [request])

  useEffect(() => {
    if (hydrated) resolveWaiting()
  }, [hydrated, exchanges.length])

  // The newest exchange at the top of the sheet's own scroll (never the page's).
  useEffect(() => {
    if (!open) return
    const box = bodyRef.current
    const el = lastRef.current
    if (box && el) box.scrollTo?.({ top: Math.max(0, el.offsetTop - 8), behavior: 'smooth' })
  }, [exchanges.length, open])

  const lastId = exchanges.at(-1)?.id
  const canFold = open && !held && lastId !== undefined && folded.current !== lastId && collapsible(latestGroup(exchanges), canUndo)
  useEffect(() => {
    if (!canFold) return
    const t = setTimeout(() => {
      const group = latestGroup(useConversation.getState().exchanges)
      folded.current = group.at(-1)?.id
      const ids = group.map((e) => e.id)
      toast(toastText(group), { action: { label: 'Desfazer', run: () => ids.forEach(undoReply) } })
      setOpen(false)
    }, FOLD_MS)
    return () => clearTimeout(t)
  }, [canFold, lastId])

  return (
    <AnimatePresence>
      {open && (
        <SheetFrame onClose={() => setOpen(false)} maxHeight="85dvh" label="Conversa com a Lumos">
          <div className="flex flex-col min-h-0 flex-1" onPointerDownCapture={() => setHeld(true)}>
            <div className="flex items-center justify-between gap-2 px-5 pb-1">
              <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] font-semibold text-plum">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-plum" />
                Lumos
              </span>
              <IconButton label="Fechar conversa" onClick={() => setOpen(false)} className="-mr-2">
                <X size={20} />
              </IconButton>
            </div>
            <div ref={bodyRef} className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 space-y-5" aria-live="polite">
              {exchanges.map((e, i) => (
                <div key={e.id} ref={i === exchanges.length - 1 ? lastRef : undefined}>
                  <ExchangeView e={e} db={db} today={today} minutes={minutes} />
                </div>
              ))}
            </div>
            <div className="px-4 pt-2.5 border-t border-line/60" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
              <Composer variant="page" placeholder="responder ou pedir mais…" />
            </div>
          </div>
        </SheetFrame>
      )}
    </AnimatePresence>
  )
}
