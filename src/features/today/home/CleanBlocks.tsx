/**
 * Home limpa — the blocks Home is made of (picks in ./clean.ts). Every row is ONE line; tapping opens the
 * existing detail (the Agenda's entry detail, the booking sheet, the quick-edit sheet) where the full text lives.
 */
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, ChevronRight, TriangleAlert } from 'lucide-react'
import { CATEGORY_META, type CalendarConflict, type CalendarEntry } from '@/data/calendar/universal'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { dayHeader, entryChip, rowTime, shortTitle, type Need, type NextDay } from './clean'

/** Section header on Home: small olive label ("01 / Agora") over a Bodoni title — the site's pattern. */
export function Eyebrow({ children, label, action }: { children: ReactNode; label?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 min-h-9 mb-1.5">
      <div className="min-w-0">
        {label && <div className="eyebrow text-[12px] leading-none mb-1.5">{label}</div>}
        <h2 className="section-title">{children}</h2>
      </div>
      {action}
    </div>
  )
}

export function Chip({ children, tone = 'soft' }: { children: ReactNode; tone?: 'soft' | 'warn' | 'done' }) {
  return (
    <span
      className={cn(
        'shrink-0 h-[22px] px-2 rounded-full text-[11.5px] leading-[22px] whitespace-nowrap',
        tone === 'warn' && 'bg-sand-soft text-[color-mix(in_oklab,var(--sand)_62%,var(--ink))]',
        tone === 'done' && 'bg-sage-soft text-[color-mix(in_oklab,var(--sage)_70%,var(--ink))]',
        tone === 'soft' && 'bg-surface-2 text-ink-2',
      )}
    >
      {children}
    </span>
  )
}

const chipTone = (c: string) => (c === 'feito' || c === 'pago' ? 'done' : 'warn')

function OneLine({ left, title, chip, onOpen, muted, label }: { left?: ReactNode; title: string; chip?: string; onOpen: () => void; muted?: boolean; label?: string }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          haptic('light')
          onOpen()
        }}
        aria-label={label}
        className="w-full min-h-11 flex items-center gap-3 text-left active:opacity-70"
      >
        {left}
        <span className={cn('flex-1 min-w-0 truncate text-[15px]', muted ? 'text-muted line-through decoration-muted/50' : 'text-ink')}>{title}</span>
        {chip && <Chip tone={chipTone(chip)}>{chip}</Chip>}
      </button>
    </li>
  )
}

function EntryLine({ e, onOpen }: { e: CalendarEntry; onOpen: (e: CalendarEntry) => void }) {
  const db = useDB()
  const chip = entryChip(db, e)
  const time = rowTime(e)
  return (
    <OneLine
      left={
        <span className="w-[62px] shrink-0 flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: CATEGORY_META[e.category].color }} />
          <span className={cn('tabular-nums', time === 'dia todo' ? 'text-[12px] text-muted' : 'text-[14px] text-ink-2 font-medium')}>{time}</span>
        </span>
      }
      title={shortTitle(e.title, 60)}
      chip={chip}
      muted={e.status === 'feito'}
      onOpen={() => onOpen(e)}
    />
  )
}

// ─── Hoje ───────────────────────────────────────────────────────────────────

export function HojeList({ rows, onOpen, conflicts, onConflicts }: { rows: CalendarEntry[]; onOpen: (e: CalendarEntry) => void; conflicts: number; onConflicts: () => void }) {
  return (
    <section aria-label="Hoje">
      <Eyebrow
        label="01 / Dia"
        action={
          conflicts > 0 ? (
            <button type="button" onClick={onConflicts} className="h-8 px-2.5 -mr-1 rounded-full inline-flex items-center gap-1 text-[12px] bg-sand-soft text-ink-2 active:opacity-70">
              <TriangleAlert size={12} aria-hidden />
              {conflicts === 1 ? '1 conflito' : `${conflicts} conflitos`}
            </button>
          ) : undefined
        }
      >
        Hoje
      </Eyebrow>
      {rows.length ? (
        <ul className="divide-y divide-line/60">
          {rows.map((e) => (
            <EntryLine key={e.id} e={e} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-ink-2 py-2">Dia livre</p>
      )}
    </section>
  )
}

// ─── Próximos dias ──────────────────────────────────────────────────────────

export function ProximosList({
  days,
  today,
  onOpen,
  agendaHref,
  conflicts,
  onConflicts,
}: {
  days: NextDay[]
  today: DateKey
  onOpen: (e: CalendarEntry, d: DateKey) => void
  agendaHref: string
  /** Conflicts per day: a day with any gets its own small chip next to its name. */
  conflicts?: Map<DateKey, number>
  onConflicts?: (date: DateKey) => void
}) {
  return (
    <section aria-label="Próximos dias">
      <Eyebrow label="02 / Agenda" action={<SeeAll to={agendaHref}>Ver agenda</SeeAll>}>
        Próximos dias
      </Eyebrow>
      {days.length ? (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.date} aria-label={dayHeader(d.date, today)} role="group">
              <div className="flex items-center justify-between gap-2 pt-1">
                <h3 className="text-[12.5px] text-muted font-medium">{dayHeader(d.date, today)}</h3>
                {!!conflicts?.get(d.date) && (
                  <button type="button" onClick={() => onConflicts?.(d.date)} className="h-7 px-2 -mr-1 rounded-full inline-flex items-center gap-1 text-[11.5px] bg-sand-soft text-ink-2 active:opacity-70">
                    <TriangleAlert size={11} aria-hidden />
                    {conflicts.get(d.date) === 1 ? '1 conflito' : `${conflicts.get(d.date)} conflitos`}
                  </button>
                )}
              </div>
              <ul className="divide-y divide-line/60">
                {d.rows.map((e) => (
                  <EntryLine key={e.id} e={e} onOpen={(x) => onOpen(x, d.date)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[15px] text-ink-2 py-2">Nada marcado</p>
      )}
    </section>
  )
}

function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="h-8 -mr-1 px-1 inline-flex items-center gap-0.5 text-[13px] text-muted active:opacity-70">
      {children}
      <ChevronRight size={14} aria-hidden />
    </Link>
  )
}

// ─── Precisa de você ────────────────────────────────────────────────────────

export function PrecisaList({ needs, onOpen, allHref }: { needs: Need[]; onOpen: (n: Need) => void; allHref: string }) {
  if (!needs.length) return null
  return (
    <section aria-label="Precisa de você">
      <Eyebrow label="03 / Pendências" action={<SeeAll to={allHref}>Ver tudo</SeeAll>}>
        Precisa de você
      </Eyebrow>
      <ul className="divide-y divide-line/60">
        {needs.map((n) => (
          <OneLine key={n.key} title={n.title} chip={n.chip} onOpen={() => onOpen(n)} />
        ))}
      </ul>
    </section>
  )
}

// ─── Viagem: one chip line ──────────────────────────────────────────────────

export function TripChips({ flight, balance, to, label }: { flight?: string; balance?: string; to: string; label: string }) {
  if (!flight && !balance) return null
  return (
    <Link to={to} aria-label={label} className="flex flex-wrap items-center gap-1.5 active:opacity-70">
      {flight && <span className="h-8 px-3 rounded-full bg-surface-2 text-[13px] text-ink-2 inline-flex items-center">✈︎ {flight}</span>}
      {balance && <span className="h-8 px-3 rounded-full bg-surface-2 text-[13px] text-ink-2 inline-flex items-center tabular-nums">Saldo {balance}</span>}
    </Link>
  )
}

/** One quiet line for the CRM: "Oportunidades · 4 aguardando · 2 pedem ação". */
export function CrmLine({ waiting, action, to }: { waiting: number; action: number; to: string }) {
  return (
    <Link to={to} aria-label="Abrir o CRM de marcas" className="flex items-center gap-2 min-h-11 text-[14px] text-ink-2 active:opacity-70">
      <span className="eyebrow text-accent">Oportunidades</span>
      <span className="truncate tabular-nums">
        · {waiting} aguardando · {action} {action === 1 ? 'pede' : 'pedem'} ação
      </span>
    </Link>
  )
}

// ─── Lumos: one small line ──────────────────────────────────────────────────

/** One quiet input to Lumos (voice, prints and files live on the Lumos page). */
export function LumosLine({ onAsk }: { onAsk: (text: string) => void }) {
  const [text, setText] = useState('')
  const send = (e: FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (!q) return
    haptic('light')
    setText('')
    onAsk(q)
  }
  return (
    <form onSubmit={send} aria-label="Lumos" className="flex items-center gap-2 h-12 rounded-full bg-surface border border-line/80 pl-4 pr-1">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-plum shrink-0" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Fala com a Lumos"
        placeholder="Pergunte à Lumos"
        enterKeyHint="send"
        className="flex-1 min-w-0 bg-transparent text-[15px] text-ink placeholder:text-muted/80 outline-none"
      />
      <button type="submit" aria-label="Enviar para a Lumos" className={cn('h-10 w-10 rounded-full inline-flex items-center justify-center transition active:scale-95', text.trim() ? 'bg-ink text-bg' : 'text-muted')}>
        <ArrowUp size={18} />
      </button>
    </form>
  )
}

// ─── Conflicts (opened by the tiny chip) ────────────────────────────────────

export function ConflictList({ conflicts, onOpenEntry }: { conflicts: CalendarConflict[]; onOpenEntry: (id: string, date: DateKey) => void }) {
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
      <h2 className="font-display text-[22px] mb-2">Conflitos</h2>
      <ul className="divide-y divide-line/60">
        {conflicts.map((c) => (
          <li key={c.key}>
            <button type="button" onClick={() => c.ids[0] && onOpenEntry(c.ids[0], c.date)} className="w-full min-h-11 py-2 flex items-start gap-2.5 text-left text-[14.5px] active:opacity-70">
              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-sand" aria-hidden />
              <span className="flex-1">{c.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
