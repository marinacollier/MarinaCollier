/**
 * The quiet strip under the greeting: shows ONLY when something needs a decision —
 * "N coisas precisam de você" and a close trip. One line each, tap to expand; no cards.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import type { BundledSync } from '@/data/briefing/bundled'
import { toast } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { ItemList, ItemRow } from '@/components/ui'
import { actions, getDB, persist, useDB } from '@/data/store'
import { nowISO } from '@/lib/id'
import { tripPriorityItems, type TripPending } from '../context'
import { isCheckable } from '@/features/travel/selectors'
import type { AttentionItem, LifeContext } from '@/data/intel'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'

function StripLine({ dot, text, open, onToggle, children }: { dot: ReactNode; text: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={onToggle} className="w-full flex items-center gap-2.5 min-h-11 text-left text-[14.5px] text-ink-2 active:opacity-70">
        <span aria-hidden className="w-4 shrink-0 inline-flex justify-center">
          {dot}
        </span>
        <span className="flex-1 min-w-0 truncate">{text}</span>
        <ChevronDown size={15} className={cn('text-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-6">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A bundled weekly sync waiting for her review: one quiet line that opens the Central with it preloaded. */
export function SyncLine({ sync }: { sync: BundledSync }) {
  const nav = useNavigate()
  return (
    <button
      type="button"
      onClick={() => nav(`${ROUTES.data}?importar=1`, { state: { importText: JSON.stringify(sync.doc) } })}
      className="w-full flex items-center gap-2.5 min-h-11 text-left text-[14.5px] text-ink-2 active:opacity-70"
    >
      <span aria-hidden className="w-4 shrink-0 inline-flex justify-center">
        <span className="h-2 w-2 rounded-full bg-plum" />
      </span>
      <span className="flex-1 min-w-0 truncate">{sync.label} pronta para revisar</span>
      <ChevronRight size={15} className="text-muted shrink-0" />
    </button>
  )
}

/** NeedsAttention as ONE line; expands into the queue (dismiss or answer with Lumos). */
export function AttentionRow({ items, onAsk }: { items: AttentionItem[]; onAsk: (q: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  const n = items.length
  return (
    <section aria-label="Precisa de você">
      <StripLine dot={<span className="h-2 w-2 rounded-full bg-sand" />} text={n === 1 ? '1 coisa precisa de você' : `${n} coisas precisam de você`} open={open} onToggle={() => setOpen((o) => !o)}>
        <ul className="divide-y divide-line/60 pb-1">
          {items.map((it) => (
            <li key={it.key} className="py-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] leading-snug">{it.title}</p>
                  {it.detail && <p className="text-[12.5px] text-muted mt-0.5 leading-snug">{it.detail}</p>}
                </div>
                <button
                  type="button"
                  aria-label={`Dispensar: ${it.title}`}
                  onClick={() => {
                    actions.create('attentionAcks', { key: it.key, how: 'dismissed' })
                    toast('Tirei da fila ✓')
                  }}
                  className="-mt-2 -mr-2 h-10 w-10 shrink-0 inline-flex items-center justify-center text-muted"
                >
                  <X size={15} />
                </button>
              </div>
              {it.options && it.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {it.options.map((o) => (
                    <button key={o.label} type="button" onClick={() => onAsk(o.ask)} className="min-h-9 px-3 rounded-full bg-surface-2 text-[13px] font-medium active:scale-[0.97] transition">
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </StripLine>
    </section>
  )
}

/** The close trip: one line; expands into its open to-dos (standard rows, checkable) + "Abrir a viagem". */
export function TripLine({ trip }: { trip: NonNullable<LifeContext['nextTrip']> }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const db = useDB((d) => d)
  const t = db.trips.find((x) => x.id === trip.id)
  const items = t ? tripPriorityItems(db, t, 99) : []
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 6)
  const when = trip.daysLeft <= 0 ? 'começa hoje' : trip.daysLeft === 1 ? 'amanhã' : `em ${trip.daysLeft} dias`
  const tick = (p: TripPending) => {
    const undo = checkTripPending(p)
    if (!undo) return
    haptic('success')
    void persist()
    toast(`${p.title} ✓`, {
      action: {
        label: 'Desfazer',
        run: () => {
          undo()
          void persist()
        },
      },
    })
  }
  return (
    <section aria-label="Viagem">
      <StripLine
        dot="✈️"
        text={
          <>
            {trip.name} {when}
            {items.length > 0 && <span className="text-muted"> · {items.length === 1 ? '1 pendência' : `${items.length} pendências`}</span>}
          </>
        }
        open={open}
        onToggle={() => setOpen((o) => !o)}
      >
        <ItemList label={`Pendências de ${trip.name}`}>
          {shown.map((p) => (
            <ItemRow key={p.key} title={p.title} area="viagem" meta={p.status === 'a_confirmar' ? 'a confirmar' : undefined} checked={false} onCheck={() => tick(p)} />
          ))}
        </ItemList>
        {!items.length && <p className="text-[13.5px] text-muted py-2">Nada aberto ✨</p>}
        <div className="flex gap-4">
          {items.length > shown.length && (
            <button type="button" onClick={() => setAll(true)} className="h-10 text-[13px] text-ink-2">
              ver todas ({items.length})
            </button>
          )}
          <button type="button" onClick={() => nav(ROUTES.trip(trip.id))} className="h-10 text-[13px] text-accent font-medium">
            Abrir a viagem →
          </button>
        </div>
      </StripLine>
    </section>
  )
}

/** A trip to-do (trip item or task of the trip) → done, through the same records the trip page uses. */
function checkTripPending(p: TripPending): (() => void) | undefined {
  if (p.kind === 'tripItem') {
    const it = getDB().tripItems.find((x) => x.id === p.id)
    if (!it) return undefined
    const before = it.status
    // Same meaning as the trip page's check: to-dos → feito; bookings, flights, stays → confirmado.
    actions.update('tripItems', it.id, { status: isCheckable(it.section) ? 'feito' : 'confirmado' })
    return () => actions.update('tripItems', it.id, { status: before })
  }
  const task = getDB().tasks.find((x) => x.id === p.id)
  if (!task) return undefined
  const before = { status: task.status, completedAt: task.completedAt }
  actions.update('tasks', task.id, { status: 'done', completedAt: nowISO() })
  return () => actions.update('tasks', task.id, before)
}
