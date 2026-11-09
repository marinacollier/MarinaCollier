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
import { chipTone, dayHeader, entryChip, rowTime, shortTitle, type ChipTone, type LooseRow, type Need, type NextDay } from './clean'

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

export function Chip({ children, tone = 'soft' }: { children: ReactNode; tone?: ChipTone }) {
  return (
    <span
      className={cn(
        'shrink-0 h-[22px] px-2 rounded-full text-[11.5px] leading-[22px] whitespace-nowrap',
        tone === 'warn' && 'bg-sand-soft text-[color-mix(in_oklab,var(--sand)_62%,var(--ink))]',
        tone === 'done' && 'bg-sage-soft text-[color-mix(in_oklab,var(--sage)_70%,var(--ink))]',
        tone === 'soft' && 'bg-surface-2 text-ink-2',
        tone === 'ok' && 'bg-ocean-soft text-[color-mix(in_oklab,var(--ocean)_70%,var(--ink))]',
        tone === 'plan' && 'border border-dashed border-line text-muted leading-[20px]',
        tone === 'alert' && 'bg-plum-soft text-[color-mix(in_oklab,var(--plum)_75%,var(--ink))]',
      )}
    >
      {children}
    </span>
  )
}

function OneLine({ left, title, chip, onOpen, muted, label, conflict }: { left?: ReactNode; title: string; chip?: string; onOpen: () => void; muted?: boolean; label?: string; conflict?: boolean }) {
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
        {conflict && <Chip tone="alert">conflito</Chip>}
        {chip && <Chip tone={chipTone(chip)}>{chip}</Chip>}
      </button>
    </li>
  )
}

function EntryLine({ e, onOpen, conflict }: { e: CalendarEntry; onOpen: (e: CalendarEntry) => void; conflict?: boolean }) {
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
      muted={e.status === 'feito' || e.status === 'cancelado'}
      conflict={conflict}
      onOpen={() => onOpen(e)}
    />
  )
}

/** "Sem horário": the day's lines that have no time — never given one. */
function LooseList({ rows, onOpen }: { rows: LooseRow[]; onOpen: (r: LooseRow) => void }) {
  if (!rows.length) return null
  return (
    <div className="mt-2" role="group" aria-label="Sem horário">
      <h3 className="text-[12px] text-muted font-medium pt-1">Sem horário</h3>
      <ul className="divide-y divide-line/60">
        {rows.map((r) => (
          <OneLine
            key={r.key}
            left={<span aria-hidden className="w-[62px] shrink-0 pl-[1px] text-[12px] text-muted">—</span>}
            title={shortTitle(r.title, 60)}
            chip={r.chip}
            muted={r.done}
            onOpen={() => onOpen(r)}
          />
        ))}
      </ul>
    </div>
  )
}

/** One day, complete: timed lines in order, then "Sem horário". */
export function DayBlock({
  label,
  title,
  rows,
  loose,
  onOpen,
  onLoose,
  conflicts,
  conflictIds,
  onConflicts,
  empty = 'Dia livre',
}: {
  label: string
  title: string
  rows: CalendarEntry[]
  loose: LooseRow[]
  onOpen: (e: CalendarEntry) => void
  onLoose: (r: LooseRow) => void
  conflicts: number
  conflictIds?: ReadonlySet<string>
  onConflicts: () => void
  empty?: string
}) {
  return (
    <section aria-label={title}>
      <Eyebrow
        label={label}
        action={
          conflicts > 0 ? (
            <button type="button" onClick={onConflicts} className="h-8 px-2.5 -mr-1 rounded-full inline-flex items-center gap-1 text-[12px] bg-plum-soft text-ink-2 active:opacity-70">
              <TriangleAlert size={12} aria-hidden />
              {conflicts === 1 ? '1 conflito' : `${conflicts} conflitos`}
            </button>
          ) : undefined
        }
      >
        {title}
      </Eyebrow>
      {rows.length ? (
        <ul className="divide-y divide-line/60">
          {rows.map((e) => (
            <EntryLine key={e.id} e={e} onOpen={onOpen} conflict={conflictIds?.has(e.id)} />
          ))}
        </ul>
      ) : !loose.length ? (
        <p className="text-[15px] text-ink-2 py-2">{empty}</p>
      ) : null}
      <LooseList rows={loose} onOpen={onLoose} />
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
  label = '02 / Agenda',
  conflictIds,
  looseOf,
  onLoose,
}: {
  days: NextDay[]
  today: DateKey
  onOpen: (e: CalendarEntry, d: DateKey) => void
  agendaHref: string
  /** Conflicts per day: a day with any gets its own small chip next to its name. */
  conflicts?: Map<DateKey, number>
  onConflicts?: (date: DateKey) => void
  label?: string
  conflictIds?: ReadonlySet<string>
  /** The day's to-dos without time (shown when the day is expanded). */
  looseOf?: (d: DateKey) => LooseRow[]
  onLoose?: (r: LooseRow) => void
}) {
  const [open, setOpen] = useState<ReadonlySet<DateKey>>(new Set())
  const toggle = (d: DateKey) => setOpen((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n })
  return (
    <section aria-label="Próximos dias">
      <Eyebrow label={label} action={<SeeAll to={agendaHref}>Ver agenda</SeeAll>}>
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
                {[...d.rows, ...(open.has(d.date) ? (d.more ?? []) : [])].map((e) => (
                  <EntryLine key={e.id} e={e} onOpen={(x) => onOpen(x, d.date)} conflict={conflictIds?.has(e.id)} />
                ))}
              </ul>
              {open.has(d.date) && looseOf && onLoose && <LooseList rows={looseOf(d.date).filter((r) => r.open.kind === 'task' || !d.rows.concat(d.more ?? []).some((e) => e.id === r.key))} onOpen={onLoose} />}
              {(() => {
                const extra = (d.more?.length ?? 0) + (looseOf ? looseOf(d.date).filter((r) => r.open.kind === 'task' || !d.rows.concat(d.more ?? []).some((e) => e.id === r.key)).length : 0)
                if (!extra) return null
                return (
                  <button type="button" onClick={() => toggle(d.date)} aria-expanded={open.has(d.date)} className="h-9 text-[12.5px] text-muted active:opacity-70">
                    {open.has(d.date) ? 'Mostrar menos' : `+${extra} ${extra === 1 ? 'item' : 'itens'} nesse dia`}
                  </button>
                )
              })()}
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

export function PrecisaList({ needs, onOpen, allHref, label = '03 / Pendências' }: { needs: Need[]; onOpen: (n: Need) => void; allHref: string; label?: string }) {
  if (!needs.length) return null
  return (
    <section aria-label="Precisa de você">
      <Eyebrow label={label} action={<SeeAll to={allHref}>Ver tudo</SeeAll>}>
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
