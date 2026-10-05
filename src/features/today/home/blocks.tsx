/**
 * The quiet blocks under Lumos: AGORA / PRÓXIMO · HOJE IMPORTA · RESTANTE DO DIA, plus the
 * discreet lines that appear only when they have something real (needs-attention, insights, changes,
 * a close trip). Typography and space instead of cards.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { actions } from '@/data/store'
import type { AttentionItem, ChangeItem, Insight, LifeContext } from '@/data/intel'
import type { DateKey, DayPriority } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { setPriorityDone, MAX_PRIORITIES } from '../priorities'
import { openPriorities } from '../open-priorities'
import { openEntryFlow } from '../timeline/actions'
import type { DayRow, HomeDay } from './day'

export function Eyebrow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between min-h-9 mb-1">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  )
}

function TextLink({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="h-11 -mr-2 px-2 text-[13px] font-medium text-accent active:opacity-70">
      {children}
    </button>
  )
}

/** Opens the row's own flow (event, training, meal, task). Routines and work have none: false. */
function openRow(row: DayRow, today: DateKey): boolean {
  if (row.kind === 'routine' || row.kind === 'work') return false
  openEntryFlow(row.entry, today)
  return true
}

// ─── AGORA / PRÓXIMO ────────────────────────────────────────────────────────

export function NowBlock({ day, today, onExpand }: { day: HomeDay; today: DateKey; onExpand: () => void }) {
  const { now, next } = day
  return (
    <section aria-label="Agora">
      <div className="flex items-baseline gap-3">
        <span className="eyebrow text-accent w-[54px] shrink-0">agora</span>
        <button
          type="button"
          onClick={() => (now.row && openRow(now.row, today)) || onExpand()}
          className="flex-1 min-w-0 text-left active:opacity-70"
        >
          <span className="block font-display text-[22px] leading-tight tracking-tight">
            {now.emoji && now.state === 'busy' && <span className="mr-1.5 text-[19px]">{now.emoji}</span>}
            {now.title}
            {now.until && !now.note && <span className="text-muted">{now.state === 'free' ? ` até ${now.until}` : ` · até ${now.until}`}</span>}
          </span>
          {now.note && <span className="block text-[13px] text-muted mt-0.5">{now.note}</span>}
          {now.state === 'free' && !now.until && !next && <span className="block text-[13px] text-muted mt-0.5">o resto do dia é seu</span>}
        </button>
      </div>
      {next && (
        <div className="flex items-baseline gap-3 mt-2.5">
          <span className="eyebrow w-[54px] shrink-0">depois</span>
          <button type="button" onClick={() => openRow(next, today) || onExpand()} className="flex-1 min-w-0 text-left text-[16px] text-ink-2 active:opacity-70">
            <span className="font-sport text-[17px] tabular-nums text-ink mr-2">{next.approx ? '~' : ''}{next.start}</span>
            {next.emoji && <span className="mr-1">{next.emoji}</span>}
            {next.title}
          </button>
        </div>
      )}
    </section>
  )
}

// ─── HOJE IMPORTA ───────────────────────────────────────────────────────────

export function ImportaBlock({ list, today, onAsk }: { list: DayPriority[]; today: DateKey; onAsk: (q: string) => void }) {
  const shown = list.slice(0, MAX_PRIORITIES)
  return (
    <section aria-label="Hoje importa">
      <Eyebrow action={shown.length > 0 ? <TextLink onClick={() => openPriorities(today)}>editar</TextLink> : undefined}>Hoje importa</Eyebrow>
      {shown.length === 0 ? (
        <div>
          <p className="text-[15px] text-ink-2 leading-snug">Ainda sem as três de hoje.</p>
          <div className="flex items-center gap-1 -ml-2 mt-0.5">
            <button type="button" onClick={() => onAsk('o que realmente importa hoje?')} className="h-11 px-2 text-[14px] font-medium text-accent active:opacity-70">
              escolher com a Lumos
            </button>
            <span className="text-muted/60" aria-hidden>
              ·
            </span>
            <button type="button" onClick={() => openPriorities(today)} className="h-11 px-2 text-[14px] text-muted active:opacity-70">
              eu escolho
            </button>
          </div>
        </div>
      ) : (
        <ol>
          {shown.map((p, i) => (
            <li key={p.id} className="flex items-start gap-3 min-h-[48px]">
              <button
                type="button"
                aria-label={p.done ? `Desmarcar ${p.title}` : `Concluir ${p.title}`}
                aria-pressed={p.done}
                onClick={() => {
                  setPriorityDone(p.id, !p.done)
                  if (!p.done) {
                    haptic('success')
                    const left = shown.filter((x) => !x.done && x.id !== p.id).length
                    toast(left === 0 ? 'As de hoje: feitas ✨' : 'Uma a menos ✓', { tone: left === 0 ? 'win' : 'default' })
                  }
                }}
                className={cn('h-11 w-9 -ml-1 shrink-0 font-display text-[19px] tabular-nums text-left transition-colors', p.done ? 'text-muted/50' : 'text-accent')}
              >
                {String(i + 1).padStart(2, '0')}
              </button>
              <button type="button" onClick={() => openPriorities(today)} className="flex-1 min-w-0 text-left py-2.5">
                <span className={cn('text-[17px] leading-snug transition-colors', p.done && 'text-muted line-through decoration-muted/40')}>{p.title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// ─── RESTANTE DO DIA ────────────────────────────────────────────────────────

export function RestBlock({ day, today, expanded, onExpand }: { day: HomeDay; today: DateKey; expanded: boolean; onExpand: () => void }) {
  if (!day.rest.length && !expanded) {
    return (
      <button type="button" onClick={onExpand} className="h-11 -ml-0.5 inline-flex items-center gap-1 text-[13px] text-muted active:opacity-70">
        ver o dia inteiro <ChevronRight size={14} />
      </button>
    )
  }
  return (
    <section aria-label="Restante do dia">
      <Eyebrow action={<TextLink onClick={onExpand}>{expanded ? 'recolher' : 'o dia inteiro'}</TextLink>}>Restante do dia</Eyebrow>
      {!expanded && (
        <ul>
          {day.rest.map((r) => (
            <li key={r.key}>
              <button type="button" onClick={() => openRow(r, today) || onExpand()} className="w-full flex items-baseline gap-3 min-h-11 py-1.5 text-left active:opacity-70">
                <span className="w-[54px] shrink-0 font-sport text-[17px] tabular-nums text-ink">
                  {r.approx ? '~' : ''}
                  {r.start}
                </span>
                <span className="flex-1 min-w-0 text-[15.5px] text-ink-2 truncate">
                  {r.emoji && <span className="mr-1.5">{r.emoji}</span>}
                  {r.title}
                  {r.approx && <span className="text-muted text-[13px]"> · horário a definir</span>}
                </span>
              </button>
            </li>
          ))}
          {day.more > 0 && (
            <li>
              <button type="button" onClick={onExpand} className="h-10 pl-[66px] text-[13px] text-muted active:opacity-70">
                + {day.more} {day.more === 1 ? 'coisa' : 'coisas'} mais tarde
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

// ─── Discreet lines ─────────────────────────────────────────────────────────

/** NeedsAttention as ONE row; expands into the queue. */
export function AttentionRow({ items, onAsk }: { items: AttentionItem[]; onAsk: (q: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  const n = items.length
  return (
    <section aria-label="Precisa de você" className="rounded-[22px] bg-sand-soft/70">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2.5 min-h-12 px-4 text-left">
        <span aria-hidden className="h-2 w-2 rounded-full bg-sand" />
        <span className="flex-1 text-[14.5px] text-ink">{n === 1 ? '1 coisa precisa de você' : `${n} coisas precisam de você`}</span>
        <ChevronDown size={16} className={cn('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4">
            {items.map((it) => (
              <li key={it.key} className="py-2.5 border-t border-line/60 first:border-t-0">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14.5px] leading-snug">{it.title}</p>
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
                      <button key={o.label} type="button" onClick={() => onAsk(o.ask)} className="min-h-9 px-3 rounded-full bg-surface text-[13px] font-medium active:scale-[0.97] transition">
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
            <li className="h-2" aria-hidden />
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  )
}

/** 0–3 proactive insights, one line each. Tapping asks Lumos. */
export function InsightLines({ items, onAsk }: { items: Insight[]; onAsk: (q: string) => void }) {
  if (!items.length) return null
  return (
    <ul aria-label="Lumos percebeu" className="space-y-0.5">
      {items.slice(0, 3).map((i) => (
        <li key={i.key}>
          <button
            type="button"
            disabled={!i.ask}
            onClick={() => i.ask && onAsk(i.ask)}
            className="w-full flex items-start gap-2.5 min-h-10 py-1.5 text-left text-[14px] text-ink-2 leading-snug enabled:active:opacity-70"
          >
            <span aria-hidden className="text-plum mt-[1px]">
              ✦
            </span>
            <span className="flex-1">
              {i.text}
              {(i.provenance === 'inference' || i.provenance === 'suggestion') && <span className="text-muted text-[12px]"> · {i.provenance === 'inference' ? 'percebi' : 'sugestão'}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** "o que mudou" since the last visit — computed once when Home opens. */
export function ChangesLine({ summary, items }: { summary: string; items: ChangeItem[] }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full flex items-start gap-2.5 min-h-10 py-1.5 text-left text-[14px] text-ink-2 leading-snug active:opacity-70">
        <span aria-hidden className="text-ocean mt-[1px]">
          ↻
        </span>
        <span className="flex-1">{summary}</span>
        <ChevronDown size={15} className={cn('text-muted mt-0.5 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-6">
            {items.slice(0, 8).map((c) => (
              <li key={`${c.at}-${c.title}`} className="text-[13px] text-muted py-1 leading-snug">
                {c.title}
                {c.by === 'lumos' && ' · Lumos'}
                {c.by === 'integration' && ' · integração'}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Smart surfacing: a close trip as one tiny line. Disappears after the trip on its own. */
export function TripLine({ trip }: { trip: NonNullable<LifeContext['nextTrip']> }) {
  const nav = useNavigate()
  const when = trip.daysLeft <= 0 ? 'começa hoje' : trip.daysLeft === 1 ? 'amanhã' : `em ${trip.daysLeft} dias`
  return (
    <button type="button" onClick={() => nav(ROUTES.trip(trip.id))} className="w-full flex items-start gap-2.5 min-h-10 py-1.5 text-left text-[14px] text-ink-2 leading-snug active:opacity-70">
      <span aria-hidden className="mt-[1px]">
        ✈️
      </span>
      <span className="flex-1">
        {trip.name} {when}
        {trip.openItems > 0 && <span className="text-muted"> · {trip.openItems === 1 ? '1 coisa aberta' : `${trip.openItems} coisas abertas`}</span>}
      </span>
    </button>
  )
}
