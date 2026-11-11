/**
 * Home limpa — the blocks Home is made of (picks in ./clean.ts). Every row is ONE line; tapping opens the
 * existing detail (the Agenda's entry detail, the booking sheet, the quick-edit sheet) where the full text lives.
 */
import { useCallback, useId, useMemo, useRef, useState, type FormEvent, type LiHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, ChevronRight, Redo2, TriangleAlert } from 'lucide-react'
import { SwipeRow } from '@/components/ui/SwipeRow'
import { CATEGORY_META, type CalendarConflict, type CalendarEntry } from '@/data/calendar/universal'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { fixityOf } from './adaptive'
import { chipTone, dayHeader, entryChip, entryLabel, rowTime, shortTitle, type ChipTone, type LooseRow, type Need, type NextDay, type RoutineRow, routineComplete } from './clean'
import type { BlockRow } from './allocation'
import { actions } from '@/data/store'
import { routineItemsFor } from '@/data/selectors'
import { occurrenceFor } from '@/lib/recurrence'
import { Check } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { SheetFrame } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { toast } from '@/app/ui-store'
import { dropTime, type DragRow, type DropSlot } from './drag'
import { useLongPressDrag } from './useLongPressDrag'
import { planMove, type MovePlan, type RowResult } from './row-actions'

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

/** One-tap actions of a line: the round check (Concluir / desfazer) and the swipes (→ concluir · ← adiar). */
export interface LineAct {
  done: boolean
  onDone: () => void
  onPostpone?: () => void
}

type LiProps = LiHTMLAttributes<HTMLLIElement> & { 'data-drag-index'?: number }

function OneLine({ left, title, chip, onOpen, muted, label, conflict, kind, quiet, act, hint, li }: { left?: ReactNode; title: string; chip?: string; onOpen: () => void; muted?: boolean; label?: string; conflict?: boolean; kind?: string; quiet?: boolean; act?: LineAct; hint?: string; li?: LiProps }) {
  const row = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          haptic('light')
          onOpen()
        }}
        aria-label={label}
        aria-describedby={hint}
        className="flex-1 min-w-0 min-h-11 flex items-center gap-3 text-left active:opacity-70"
      >
        {left}
        <span className="flex-1 min-w-0">
          {kind && <span className="block text-[10.5px] leading-[14px] uppercase tracking-[0.06em] text-muted truncate">{kind}</span>}
          <span className={cn('block truncate', quiet ? 'text-[14px] text-ink-2' : 'text-[15px]', muted ? 'text-muted line-through decoration-muted/50' : !quiet && 'text-ink')}>{title}</span>
        </span>
        {conflict && <Chip tone="alert">conflito</Chip>}
        {chip && <Chip tone={chipTone(chip)}>{chip}</Chip>}
      </button>
      {act && (
        <button
          type="button"
          aria-label={act.done ? `Desfazer concluído: ${title}` : `Concluir: ${title}`}
          aria-pressed={act.done}
          onClick={() => {
            haptic('light')
            act.onDone()
          }}
          className="h-11 w-11 -mr-2 shrink-0 inline-flex items-center justify-center active:scale-90 transition"
        >
          <span className={cn('h-[22px] w-[22px] rounded-full border-[1.5px] inline-flex items-center justify-center', act.done ? 'bg-sage border-sage text-bg' : 'border-line')}>{act.done && <Check size={13} strokeWidth={3} aria-hidden />}</span>
        </button>
      )}
    </div>
  )
  if (!act) return <li {...li}>{row}</li>
  return (
    <li {...li}>
      <SwipeRow onComplete={act.onDone} onDelete={act.onPostpone} completeLabel={act.done ? 'Desfazer' : 'Concluir'} deleteLabel="Amanhã" deleteIcon={<Redo2 size={18} aria-hidden />} className="rounded-none">
        {row}
      </SwipeRow>
    </li>
  )
}

function EntryLine({ e, onOpen, conflict, act, hint, li }: { e: CalendarEntry; onOpen: (e: CalendarEntry) => void; conflict?: boolean; act?: LineAct; hint?: string; li?: LiProps }) {
  const db = useDB()
  const chip = entryChip(db, e)
  const kind = entryLabel(db, e)
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
      kind={!e.allDay && e.startAt.time && e.status !== 'feito' && fixityOf(e) === 'fixo' ? `${kind} · fixo` : kind}
      act={act}
      hint={hint}
      li={li}
      onOpen={() => onOpen(e)}
    />
  )
}

/** "Sem horário": the day's lines that have no time — never given one. */
function LooseList({ rows, onOpen, actOf }: { rows: LooseRow[]; onOpen: (r: LooseRow) => void; actOf?: (r: LooseRow) => LineAct | undefined }) {
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
            act={actOf?.(r)}
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
  routines,
  items,
  onBlock,
  onRoutine,
  actOf,
  onMove,
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
  /** Her rituals of the day (Hoje only). */
  routines?: ReactNode
  /** ONE chronological timeline (commitments + planned blocks + rituals). When given, replaces `rows`. */
  items?: TLItem[]
  onBlock?: (b: TLBlock) => void
  onRoutine?: (id: string) => void
  /** One-tap actions per line (concluir / adiar). */
  actOf?: (it: TLItem | { kind: 'loose'; r: LooseRow }) => LineAct | undefined
  /** Long-press + drag a timed line to another time (Hoje). See `moveOnTimeline`. */
  onMove?: TimelineMove
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
      {items ? (
        items.length ? (
          <Timeline items={items} onOpen={onOpen} conflictIds={conflictIds} actOf={actOf} onBlock={onBlock} onRoutine={onRoutine} onMove={onMove} />
        ) : null
      ) : rows.length ? (
        <ul className="divide-y divide-line/60">
          {rows.map((e) => (
            <EntryLine key={e.id} e={e} onOpen={onOpen} conflict={conflictIds?.has(e.id)} />
          ))}
        </ul>
      ) : null}
      {(items ? !items.length : !rows.length) && !loose.length && !routines ? (
        <p className="text-[15px] text-ink-2 py-2">{empty}</p>
      ) : null}
      {routines}
      <LooseList rows={loose} onOpen={onLoose} actOf={actOf ? (r) => actOf({ kind: 'loose', r }) : undefined} />
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

// ─── Rotinas ────────────────────────────────────────────────────────────────

/** "06:00 · ☀️ Milagre da Manhã · 3/12" — tap opens the checklist. */
export function RoutineList({ rows, onOpen }: { rows: RoutineRow[]; onOpen: (id: string) => void }) {
  if (!rows.length) return null
  return (
    <div className="mt-2" role="group" aria-label="Rotinas">
      <h3 className="text-[12px] text-muted font-medium pt-1">Rotinas</h3>
      <ul className="divide-y divide-line/60">
        {rows.map((r) => (
          <OneLine
            key={r.id}
            label={`${r.name}: ${r.done} de ${r.total}`}
            left={<span className="w-[62px] shrink-0 tabular-nums text-[14px] text-ink-2 font-medium">{r.time ?? '—'}</span>}
            title={`${r.emoji ? `${r.emoji} ` : ''}${r.name}`}
            chip={r.total && r.done >= r.total ? 'feito' : `${r.done}/${r.total}`}
            muted={routineComplete(r)}
            onOpen={() => onOpen(r.id)}
          />
        ))}
      </ul>
    </div>
  )
}

/** The routine's items for the day; each tap ticks/unticks it (an occurrence of that day — the rule never changes). */
export function RoutineChecklist({ routineId, date }: { routineId: string; date: DateKey }) {
  const db = useDB()
  const routine = db.routines.find((r) => r.id === routineId)
  const items = routineItemsFor(db, routineId, date)
  if (!routine) return null
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
      <h2 className="font-display text-[22px] mb-2">
        {routine.emoji ? `${routine.emoji} ` : ''}
        {routine.name}
      </h2>
      <ul className="divide-y divide-line/60">
        {items.map((i) => {
          const done = occurrenceFor(db.occurrences, 'routineItem', i.id, date)?.status === 'done'
          return (
            <li key={i.id}>
              <button
                type="button"
                aria-pressed={done}
                onClick={() => {
                  haptic('light')
                  actions.toggleOccurrence('routineItem', i.id, date)
                }}
                className="w-full min-h-11 py-2 flex items-center gap-3 text-left active:opacity-70"
              >
                <span className={cn('h-6 w-6 shrink-0 rounded-full border inline-flex items-center justify-center', done ? 'bg-sage border-sage text-bg' : 'border-line')}>{done && <Check size={14} aria-hidden />}</span>
                <span className={cn('flex-1 text-[15px]', done ? 'text-muted line-through decoration-muted/50' : 'text-ink')}>{i.title}</span>
                {!!i.durationMin && <span className="text-[12px] text-muted tabular-nums">{i.durationMin} min</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Timeline items ─────────────────────────────────────────────────────────

export type TLBlock = { kind: 'block'; time: string; b: BlockRow; label: string }
export type TLItem =
  | { kind: 'entry'; time: string; e: CalendarEntry }
  | TLBlock
  | { kind: 'routine'; time: string; r: RoutineRow }
  | { kind: 'quiet'; time: string; end?: string; title: string; onOpen: () => void }

function TimeCell({ time, end }: { time?: string; end?: string }) {
  return (
    <span className="w-[62px] shrink-0 flex flex-col leading-tight tabular-nums">
      <span className="text-[14px] text-ink-2 font-medium">{time ?? '—'}</span>
      {end && <span className="text-[11px] text-muted">até {end}</span>}
    </span>
  )
}

// ─── Arrastar na linha do tempo ─────────────────────────────────────────────

export type TimelineMove = (it: TLItem, slot: DropSlot) => MovePlan | undefined

/** Hers to move on that day: commitments and planned blocks (routines and quiet lines never move). */
export const moveOnTimeline =
  (date: DateKey): TimelineMove =>
  (it, slot) =>
    it.kind === 'entry' ? planMove({ kind: 'entry', e: it.e, date }, slot) : it.kind === 'block' ? planMove({ kind: 'block', b: it.b, date }, slot) : undefined

function canDragItem(it: TLItem): boolean {
  if (it.kind === 'entry') return !!it.e.startAt.time && !it.e.allDay
  if (it.kind === 'block') return it.b.state !== 'sugestao'
  return false
}

function dragRowOf(it: TLItem): DragRow {
  switch (it.kind) {
    case 'entry':
      return { start: it.e.startAt.time, end: it.e.endAt?.date === it.e.startAt.date ? it.e.endAt.time : undefined }
    case 'block':
      return { start: it.b.start, end: it.b.end }
    case 'routine':
      return { start: it.r.time }
    case 'quiet':
      return { start: it.time, end: it.end }
  }
}

const showResult = (r: RowResult) => toast(r.message, r.undo ? { action: { label: 'Desfazer', run: r.undo } } : {})

function Timeline({
  items,
  onOpen,
  conflictIds,
  actOf,
  onBlock,
  onRoutine,
  onMove,
}: {
  items: TLItem[]
  onOpen: (e: CalendarEntry) => void
  conflictIds?: ReadonlySet<string>
  actOf?: (it: TLItem | { kind: 'loose'; r: LooseRow }) => LineAct | undefined
  onBlock?: (b: TLBlock) => void
  onRoutine?: (id: string) => void
  onMove?: TimelineMove
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const hintId = useId()
  const rows = useMemo(() => items.map(dragRowOf), [items])
  const [confirm, setConfirm] = useState<{ message: string; run: () => RowResult }>()
  const canDrag = useCallback((i: number) => !!onMove && !!items[i] && canDragItem(items[i]), [onMove, items])
  const onDrop = useCallback(
    (from: number, to: number) => {
      const it = items[from]
      const slot = dropTime(rows, from, to)
      const plan = it && slot ? onMove?.(it, slot) : undefined
      if (!plan) return
      haptic('light')
      if (plan.kind === 'move') showResult(plan.run())
      else if (plan.kind === 'confirm') setConfirm({ message: plan.message, run: plan.run })
      else toast(plan.message)
    },
    [items, rows, onMove],
  )
  const { view, onPointerDown, onContextMenu } = useLongPressDrag({ listRef, canDrag, onDrop })
  const slot = view && view.to !== view.from ? dropTime(rows, view.from, view.to) : undefined

  const liOf = (i: number): LiProps => {
    if (!canDrag(i)) return { 'data-drag-index': i }
    const lifted = view?.from === i
    return {
      'data-drag-index': i,
      onPointerDown: (e) => onPointerDown(i, e),
      onContextMenu,
      className: cn('select-none [-webkit-touch-callout:none]', lifted && 'relative z-20 rounded-xl bg-surface shadow-[0_12px_32px_-10px_rgba(0,0,0,0.35)]'),
      style: lifted ? { transform: `translateY(${view.dy}px) scale(1.02)`, touchAction: 'none' } : undefined,
    }
  }
  const hint = onMove ? hintId : undefined

  return (
    <div className="relative">
      <ul ref={listRef} className="divide-y divide-line/60" aria-label="Linha do tempo">
        {items.map((it, i) =>
          it.kind === 'entry' ? (
            <EntryLine key={it.e.id} e={it.e} onOpen={onOpen} conflict={conflictIds?.has(it.e.id)} act={actOf?.(it)} hint={canDrag(i) ? hint : undefined} li={liOf(i)} />
          ) : it.kind === 'block' ? (
            <OneLine
              key={`b:${it.b.key}`}
              label={`${it.label}: ${it.b.title}, ${it.b.start}–${it.b.end}`}
              left={<TimeCell time={it.b.start} end={it.b.end} />}
              kind={it.label}
              title={shortTitle(it.b.title, 60)}
              chip={it.b.state === 'feito' ? 'feito' : it.b.state === 'sugestao' ? 'sugestão' : 'planejado'}
              muted={it.b.state === 'feito'}
              onOpen={() => onBlock?.(it)}
              act={it.b.state === 'sugestao' ? undefined : actOf?.(it)}
              hint={canDrag(i) ? hint : undefined}
              li={liOf(i)}
            />
          ) : it.kind === 'routine' ? (
            <OneLine
              key={`r:${it.r.id}`}
              label={`${it.r.name}: ${it.r.done} de ${it.r.total}`}
              left={<TimeCell time={it.r.time} />}
              kind={it.r.note ? `Rotina · ${it.r.note}` : "Rotina"}
              title={`${it.r.emoji ? `${it.r.emoji} ` : ''}${it.r.name}`}
              chip={it.r.total && it.r.done >= it.r.total ? 'feito' : `${it.r.done}/${it.r.total}`}
              muted={routineComplete(it.r)}
              onOpen={() => onRoutine?.(it.r.id)}
              li={liOf(i)}
            />
          ) : (
            <OneLine key={`q:${it.title}`} left={<TimeCell time={it.time} />} kind="Rotina" title={it.title} quiet onOpen={it.onOpen} li={liOf(i)} />
          ),
        )}
      </ul>
      {view && view.to !== view.from && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: view.lineY - 1 }} data-testid="drop-line">
          <span className="h-0.5 flex-1 rounded-full bg-accent" />
          {slot && <span className="ml-2 -my-3 h-6 px-2 rounded-full bg-accent text-bg text-[12px] leading-6 tabular-nums">→ {slot.start}</span>}
        </div>
      )}
      {onMove && (
        <span id={hintId} className="sr-only">
          Arrastar para mudar o horário: toque e segure a linha
        </span>
      )}
      <AnimatePresence>
        {confirm && (
          <SheetFrame key="move-confirm" onClose={() => setConfirm(undefined)} label="Mover compromisso fixo">
            <div className="px-5 pb-6 pt-1">
              <p className="text-[15px] text-ink mb-4">{confirm.message}</p>
              <div className="flex gap-2">
                <Button variant="soft" block onClick={() => setConfirm(undefined)}>
                  Cancelar
                </Button>
                <Button
                  block
                  onClick={() => {
                    const r = confirm.run()
                    setConfirm(undefined)
                    showResult(r)
                  }}
                >
                  Mover mesmo assim
                </Button>
              </div>
            </div>
          </SheetFrame>
        )}
      </AnimatePresence>
    </div>
  )
}
