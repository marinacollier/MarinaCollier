/** Dia · Semana · Mês · Lista — four views over the same consolidated entries. */
import { useEffect, useMemo, useRef } from 'react'
import { CalendarPlus, Globe, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui'
import type { DateKey } from '@/data/types'
import { entriesOn, isSpan, isTimed, tzNote, type CalendarConflict, type CalendarEntry } from '@/data/calendar/universal'
import { addDays, formatLongDate, formatMonth, hmToMinutes, minutesToHM, WEEKDAY_SHORT, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import { layoutDay, timelineBounds } from '../layout'
import { catColor, catSoft, ConflictMark, EntryLine, iconOf, StatusTag, whenLabel } from './parts'

export interface ViewProps {
  entries: CalendarEntry[]
  marks: Map<string, CalendarConflict[]>
  conflicts: CalendarConflict[]
  today: DateKey
  selectedId?: string
  onOpen: (e: CalendarEntry, date: DateKey) => void
}

const HOUR_PX = 56
const GUTTER = 44

const notBase = (e: CalendarEntry) => !e.base
const dayLabel = (d: DateKey) => formatLongDate(d).replace(/^./, (c) => c.toUpperCase())

// ─── Dia ────────────────────────────────────────────────────────────────────

export function DayView({ date, nowMinutes, device, onNew, ...p }: ViewProps & { date: DateKey; nowMinutes?: number; device: string; onNew: (time?: string) => void }) {
  const day = useMemo(() => entriesOn(p.entries, date), [p.entries, date])
  const allDay = day.filter((e) => !isTimed(e))
  const timed = day.filter((e) => isTimed(e) && !e.base)
  const base = day.filter((e) => isTimed(e) && e.base)
  const conflicts = p.conflicts.filter((c) => c.date === date)
  const zones = [...new Set(day.map((e) => tzNote(e, device)).filter(Boolean))]
  const open = (e: CalendarEntry) => p.onOpen(e, date)

  return (
    <div className="space-y-4" aria-label={`Dia ${date}`}>
      {(conflicts.length > 0 || zones.length > 0) && (
        <div className="space-y-1.5">
          {conflicts.length > 0 && (
            <section aria-label="Pontos de atenção do dia" className="rounded-2xl border border-dashed border-sand/70 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
                <TriangleAlert size={14} className="text-sand" aria-hidden />
                {conflicts.length === 1 ? '1 ponto de atenção' : `${conflicts.length} pontos de atenção`}
              </div>
              <ul className="mt-1 space-y-0.5">
                {conflicts.map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      className="text-left text-[13px] text-muted leading-snug py-1"
                      onClick={() => {
                        const first = p.entries.find((e) => e.id === c.ids[0])
                        if (first) open(first)
                      }}
                    >
                      {c.text}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {zones.map((z) => (
            <div key={z} className="flex items-center gap-1.5 text-[12px] text-muted px-1">
              <Globe size={13} aria-hidden /> Itens da viagem no {z}, como foram marcados.
            </div>
          ))}
        </div>
      )}

      {allDay.length > 0 && (
        <section aria-label="Dia todo" className="card px-3 py-1.5">
          {allDay.map((e) => (
            <EntryLine key={e.id} entry={e} conflicts={p.marks.get(e.id)} onOpen={open} dense selected={p.selectedId === e.id} />
          ))}
        </section>
      )}

      {timed.length || base.length ? (
        <DayGrid date={date} entries={timed} base={base} marks={p.marks} onOpen={open} selectedId={p.selectedId} nowMinutes={nowMinutes} onNew={onNew} />
      ) : (
        <div className="card flex flex-col items-center text-center py-8 px-6">
          <div className="font-display text-[19px]">{date === p.today ? 'Dia livre de compromissos.' : 'Nada com horário nesse dia.'}</div>
          <div className="text-[13.5px] text-muted mt-1">Espaço pra respirar.</div>
          <Button variant="soft" size="sm" className="mt-4" icon={<CalendarPlus size={15} />} onClick={() => onNew()}>
            Novo compromisso
          </Button>
        </div>
      )}
    </div>
  )
}

function DayGrid({
  date,
  entries,
  base,
  marks,
  onOpen,
  selectedId,
  nowMinutes,
  onNew,
}: {
  date: DateKey
  entries: CalendarEntry[]
  base: CalendarEntry[]
  marks: Map<string, CalendarConflict[]>
  onOpen: (e: CalendarEntry) => void
  selectedId?: string
  nowMinutes?: number
  onNew: (time?: string) => void
}) {
  const items = useMemo(() => entries.map((e) => ({ e, time: e.startAt.time, endTime: e.endAt.time, allDay: false })), [entries])
  const placed = useMemo(() => layoutDay(items), [items])
  const { fromHour, toHour } = useMemo(() => timelineBounds([...items, ...base.map((b) => ({ time: b.startAt.time, endTime: b.endAt.time }))]), [items, base])
  const start = fromHour * 60
  const y = (min: number) => ((min - start) / 60) * HOUR_PX
  const height = (toHour - fromHour) * HOUR_PX
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i)
  const showNow = nowMinutes !== undefined && nowMinutes >= start && nowMinutes <= toHour * 60
  const ref = useRef<HTMLDivElement>(null)

  // First paint: bring the first commitment (or "agora") into view when it is far below.
  useEffect(() => {
    // Only on today (to "agora"): other days open at the top, with their all-day lines in view.
    if (!showNow || !ref.current) return
    const target = nowMinutes! - 60
    const top = ref.current.getBoundingClientRect().top + window.scrollY + y(Math.max(start, target - 30))
    if (top > window.scrollY + window.innerHeight * 0.7) window.scrollTo({ top: top - 200 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const onGrid = (ev: React.MouseEvent<HTMLDivElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect()
    const min = start + ((ev.clientY - rect.top) / HOUR_PX) * 60
    onNew(minutesToHM(Math.min(23 * 60, Math.max(0, Math.floor(min / 60) * 60))))
  }

  return (
    <div ref={ref} className="relative select-none" style={{ height: height + 8 }} aria-label="Grade do dia">
      <div className="absolute inset-0" onClick={onGrid} role="presentation">
        {hours.map((h) => (
          <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: y(h * 60) }}>
            <span className="-mt-[7px] pr-2 text-right text-[11px] tabular-nums text-muted leading-none" style={{ width: GUTTER }}>
              {h < 24 ? `${String(h).padStart(2, '0')}:00` : ''}
            </span>
            <span className="flex-1 border-t border-line/70" />
          </div>
        ))}
      </div>

      {/* BASE work hours: quiet background bands (tap opens them). */}
      {base.map((b) => {
        const top = y(hmToMinutes(b.startAt.time!))
        const h = y(hmToMinutes(b.endAt.time ?? b.startAt.time!)) - top
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b)}
            aria-label={`${b.title} ${whenLabel(b)} (base)`}
            className="absolute right-0 rounded-l-xl text-left bg-ink/[0.03]"
            style={{ top, height: Math.max(h, 18), left: GUTTER - 2 }}
          >
            <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-ink/15" />
            <span className="absolute left-2.5 right-2 top-1 text-[10.5px] text-muted leading-none truncate">
              {b.title} · base
            </span>
          </button>
        )
      })}

      <div className="absolute top-0 bottom-0 right-0 pointer-events-none" style={{ left: GUTTER + 4 }}>
        {placed.map((pl) => {
          const e = pl.item.e
          const top = y(pl.start)
          const h = Math.max(((Math.max(pl.end, pl.start + 30) - pl.start) / 60) * HOUR_PX - 3, 26)
          const compact = h < 46
          const Icon = iconOf(e)
          const done = e.status === 'feito'
          const pending = e.status === 'pendente'
          return (
            <button
              key={e.id}
              type="button"
              data-entry={e.id}
              onClick={() => onOpen(e)}
              aria-label={`${e.title}, ${whenLabel(e)}${e.status !== 'confirmado' ? `, ${e.optional ? 'opcional' : e.status}` : ''}`}
              className={cn(
                'absolute pointer-events-auto rounded-xl overflow-hidden flex text-left transition-shadow',
                pending ? 'border-[1.5px] border-dashed' : 'border border-surface',
                done && 'opacity-60',
                e.optional && 'opacity-75',
                selectedId === e.id && 'ring-2 ring-ink/40',
              )}
              style={{
                top,
                height: h,
                left: `calc(${(pl.col / pl.cols) * 100}% + ${pl.col ? 2 : 0}px)`,
                width: `calc(${(pl.span / pl.cols) * 100}% - ${pl.col ? 4 : 2}px)`,
                background: catSoft(e),
                borderColor: pending ? catColor(e) : undefined,
              }}
            >
              <span aria-hidden className="w-[3px] shrink-0" style={{ background: catColor(e) }} />
              <span className={cn('flex-1 min-w-0 px-2', compact ? 'flex items-center gap-1.5' : 'py-1.5 flex flex-col')}>
                {compact ? (
                  <>
                    <span className="text-[11.5px] tabular-nums text-ink-2 shrink-0">{e.startAt.time}</span>
                    <span className={cn('truncate text-[13px] font-medium', done && 'line-through')}>{e.title}</span>
                    <ConflictMark conflicts={marks.get(e.id)} size={12} />
                  </>
                ) : (
                  <>
                    <span className="flex items-start gap-1.5 min-w-0">
                      <Icon size={13} className="shrink-0 mt-[2px] text-ink-2/70" aria-hidden />
                      <span className={cn('flex-1 min-w-0 text-[13.5px] font-medium leading-tight', h >= 70 ? 'line-clamp-2 break-words' : 'truncate', done && 'line-through')}>{e.title}</span>
                      <ConflictMark conflicts={marks.get(e.id)} size={12} />
                    </span>
                    <span className={cn('flex gap-x-1.5 gap-y-1 mt-0.5 min-w-0', h >= 70 ? 'flex-col items-start' : 'items-center')}>
                      <span className="text-[11.5px] tabular-nums text-ink-2/80 truncate">{e.approx ? 'horário a definir' : whenLabel(e)}</span>
                      <StatusTag entry={e} />
                    </span>
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {showNow && (
        <div className="absolute left-0 right-0 pointer-events-none flex items-center z-10" style={{ top: y(nowMinutes!) - 8 }}>
          <span className="pr-1 flex justify-end" style={{ width: GUTTER }}>
            <span className="rounded-full bg-accent text-bg text-[10px] font-semibold tabular-nums px-1.5 py-[2px] leading-none">{minutesToHM(nowMinutes!)}</span>
          </span>
          <span className="h-2 w-2 rounded-full bg-accent -ml-0.5" />
          <span className="flex-1 h-[1.5px] bg-accent" />
        </div>
      )}
    </div>
  )
}

// ─── Semana ─────────────────────────────────────────────────────────────────

export function WeekView({ from, onOpenDay, ...p }: ViewProps & { from: DateKey; onOpenDay: (d: DateKey) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-7 lg:gap-1.5" aria-label="Semana">
      {days.map((d) => {
        const list = entriesOn(p.entries, d).filter(notBase)
        const isToday = d === p.today
        return (
          <section key={d} aria-label={dayLabel(d)} className="card min-w-0 px-3 py-2 lg:px-1.5 lg:min-h-[180px]">
            <button type="button" onClick={() => onOpenDay(d)} className="w-full flex items-baseline gap-2 min-h-9 text-left lg:flex-col lg:gap-0">
              <span className={cn('text-[11px] tracking-[0.08em] font-semibold', isToday ? 'text-accent' : 'text-muted')}>{WEEKDAY_SHORT[weekday(d)]}</span>
              <span className={cn('font-display text-[19px] leading-none', isToday && 'text-accent')}>{Number(d.slice(8))}</span>
              {!list.length && <span className="text-[12px] text-muted lg:hidden">livre</span>}
            </button>
            {list.length > 0 && (
              <div className="mt-1 lg:hidden">
                {list.map((e) => (
                  <EntryLine key={e.id} entry={e} conflicts={p.marks.get(e.id)} onOpen={(x) => p.onOpen(x, d)} dense selected={p.selectedId === e.id} />
                ))}
              </div>
            )}
            <div className="hidden lg:flex flex-col gap-1 mt-1.5">
              {list.map((e) => (
                <MiniEntry key={e.id} entry={e} conflicts={p.marks.get(e.id)} onOpen={(x) => p.onOpen(x, d)} selected={p.selectedId === e.id} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function MiniEntry({ entry, conflicts, onOpen, selected }: { entry: CalendarEntry; conflicts?: CalendarConflict[]; onOpen: (e: CalendarEntry) => void; selected?: boolean }) {
  return (
    <button
      type="button"
      data-entry={entry.id}
      onClick={() => onOpen(entry)}
      aria-label={`${entry.title}, ${whenLabel(entry)}`}
      className={cn('w-full text-left rounded-lg px-1.5 py-1 flex flex-col', entry.status === 'pendente' && 'border border-dashed', entry.status === 'feito' && 'opacity-60', selected && 'ring-2 ring-ink/30')}
      style={{ background: catSoft(entry), borderColor: entry.status === 'pendente' ? catColor(entry) : undefined }}
    >
      <span className="flex items-center gap-1 text-[10.5px] tabular-nums text-ink-2/80 leading-tight">
        {isTimed(entry) ? entry.startAt.time : isSpan(entry) ? 'vários dias' : 'dia todo'}
        <ConflictMark conflicts={conflicts} size={11} />
      </span>
      <span className={cn('text-[12px] leading-tight line-clamp-2 break-words', entry.status === 'feito' && 'line-through')}>{entry.title}</span>
    </button>
  )
}

// ─── Mês ────────────────────────────────────────────────────────────────────

export function MonthView({ date, from, to, onSelectDay, onOpenDay, ...p }: ViewProps & { date: DateKey; from: DateKey; to: DateKey; onSelectDay: (d: DateKey) => void; onOpenDay: (d: DateKey) => void }) {
  const month = date.slice(0, 7)
  const cells: DateKey[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) cells.push(d)
  const selected = entriesOn(p.entries, date).filter(notBase)
  return (
    <div className="space-y-4">
      <div role="grid" aria-label={`Mês ${formatMonth(date)}`} className="card p-1.5">
        <div className="grid grid-cols-7 text-center text-[10.5px] tracking-[0.08em] text-muted font-semibold pb-1" role="row">
          {[1, 2, 3, 4, 5, 6, 0].map((w) => (
            <span key={w} role="columnheader">
              {WEEKDAY_SHORT[w]}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px" role="rowgroup">
          {cells.map((d) => {
            // Spans (trip, hospedagem) would mark every day: they show in the selected day's list.
            const list = entriesOn(p.entries, d).filter((e) => notBase(e) && !isSpan(e))
            const inMonth = d.slice(0, 7) === month
            const isSel = d === date
            const warn = p.conflicts.some((c) => c.date === d)
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                aria-selected={isSel}
                aria-label={`${dayLabel(d)}: ${list.length ? `${list.length} na agenda` : 'livre'}`}
                onClick={() => (isSel ? onOpenDay(d) : onSelectDay(d))}
                className={cn('min-h-[58px] md:min-h-[92px] rounded-lg p-1 flex flex-col items-stretch text-left transition-colors', isSel ? 'bg-surface-2' : 'active:bg-surface-2', !inMonth && 'opacity-45')}
              >
                <span className="flex items-center justify-between">
                  <span className={cn('text-[12.5px] tabular-nums leading-none h-6 w-6 rounded-full flex items-center justify-center', d === p.today && 'bg-accent text-bg font-semibold')}>{Number(d.slice(8))}</span>
                  {warn && <TriangleAlert size={11} className="text-sand mr-0.5" aria-hidden />}
                </span>
                {/* Phone: dots. Wider: the first titles. */}
                <span className="flex flex-wrap gap-[3px] mt-1 px-0.5 md:hidden">
                  {list.slice(0, 6).map((e) => (
                    <span key={e.id} aria-hidden className="h-[5px] w-[5px] rounded-full" style={{ background: catColor(e) }} />
                  ))}
                </span>
                <span className="hidden md:flex flex-col gap-[2px] mt-1">
                  {list.slice(0, 3).map((e) => (
                    <span key={e.id} className="truncate text-[10.5px] leading-tight rounded px-1 py-[1px]" style={{ background: catSoft(e) }}>
                      {e.title}
                    </span>
                  ))}
                  {list.length > 3 && <span className="text-[10px] text-muted px-1">+{list.length - 3}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <section aria-label={`Selecionado: ${dayLabel(date)}`}>
        <div className="flex items-center justify-between px-1 mb-1">
          <div className="font-display text-[18px]">{dayLabel(date)}</div>
          <Button variant="ghost" size="sm" onClick={() => onOpenDay(date)}>
            Abrir dia
          </Button>
        </div>
        <div className="card px-3 py-1.5">
          {selected.length ? (
            selected.map((e) => <EntryLine key={e.id} entry={e} conflicts={p.marks.get(e.id)} onOpen={(x) => p.onOpen(x, date)} selected={p.selectedId === e.id} />)
          ) : (
            <div className="py-4 text-center text-[13.5px] text-muted">Nada marcado nesse dia.</div>
          )}
        </div>
      </section>
    </div>
  )
}

// ─── Lista ──────────────────────────────────────────────────────────────────

export function ListView({ from, to, onMore, onOpenDay, ...p }: ViewProps & { from: DateKey; to: DateKey; onMore: () => void; onOpenDay: (d: DateKey) => void }) {
  const groups = useMemo(() => {
    const seen = new Set<string>()
    const out: { date: DateKey; list: CalendarEntry[] }[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const list = entriesOn(p.entries, d).filter((e) => {
        if (e.base) return false
        if (!isSpan(e)) return true
        if (seen.has(e.id)) return false
        seen.add(e.id)
        return true
      })
      if (list.length) out.push({ date: d, list })
    }
    return out
  }, [p.entries, from, to])
  return (
    <div className="space-y-4" aria-label="Lista">
      {groups.map((g) => (
        <section key={g.date} aria-label={dayLabel(g.date)}>
          <button type="button" onClick={() => onOpenDay(g.date)} className="flex items-baseline gap-2 px-1 mb-1 min-h-8 text-left">
            <span className={cn('font-display text-[18px]', g.date === p.today && 'text-accent')}>{dayLabel(g.date)}</span>
            {g.date === p.today && <span className="text-[12px] text-accent">hoje</span>}
          </button>
          <div className="card px-3 py-1.5">
            {g.list.map((e) => (
              <EntryLine key={e.id} entry={e} conflicts={p.marks.get(e.id)} onOpen={(x) => p.onOpen(x, g.date)} selected={p.selectedId === e.id} />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <div className="card py-8 text-center text-[14px] text-muted">Nada marcado nesse período.</div>}
      <div className="flex justify-center">
        <Button variant="soft" size="sm" onClick={onMore}>
          Mostrar mais 30 dias
        </Button>
      </div>
    </div>
  )
}
