/**
 * Agenda = the universal calendar. View state (ranges, filters, privacy) on top of the data projection
 * `calendarEntries` (src/data/calendar/universal.ts). No writes here except the per-device filter.
 */
import { useEffect, useMemo, useState } from 'react'
import { areaLocked, useLockState } from '@/app/lock-store'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import {
  calendarConflicts,
  calendarEntries,
  CATEGORY_ORDER,
  conflictIndex,
  type CalendarCategory,
  type CalendarEntry,
} from '@/data/calendar/universal'
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from '@/lib/date'

export type CalendarView = 'dia' | 'semana' | 'mes' | 'lista'

export const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'lista', label: 'Lista' },
]

/** Old links (?v=hoje / ?v=agenda) keep working. */
export function parseView(v: string | null): CalendarView {
  if (v === 'semana' || v === 'mes' || v === 'lista' || v === 'dia') return v
  if (v === 'agenda') return 'lista'
  return 'dia'
}

export const LIST_DAYS = 30

/** Inclusive date range a view shows around `date`. */
export function viewRange(view: CalendarView, date: DateKey, listDays = LIST_DAYS): { from: DateKey; to: DateKey } {
  switch (view) {
    case 'dia':
      return { from: date, to: date }
    case 'semana':
      return { from: startOfWeek(date), to: endOfWeek(date) }
    case 'mes':
      return { from: startOfWeek(startOfMonth(date)), to: endOfWeek(endOfMonth(date)) }
    case 'lista':
      return { from: date, to: addDays(date, listDays - 1) }
  }
}

/** Previous / next page of a view. */
export function shiftDate(view: CalendarView, date: DateKey, dir: 1 | -1): DateKey {
  switch (view) {
    case 'dia':
      return addDays(date, dir)
    case 'semana':
      return addDays(date, 7 * dir)
    case 'mes': {
      const first = startOfMonth(date)
      return dir > 0 ? addDays(endOfMonth(first), 1) : startOfMonth(addDays(first, -1))
    }
    case 'lista':
      return addDays(date, LIST_DAYS * dir)
  }
}

// ─── Category filter (per device) ───────────────────────────────────────────

const FILTER_KEY = 'marina-os:agenda:categorias'

export function readFilter(): CalendarCategory[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FILTER_KEY) ?? '[]')
    return Array.isArray(raw) ? CATEGORY_ORDER.filter((c) => raw.includes(c)) : []
  } catch {
    return []
  }
}

function writeFilter(list: CalendarCategory[]): void {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(list))
  } catch {
    // Private mode / blocked storage: the filter just isn't remembered.
  }
}

/** Additive category toggles; empty = Tudo. Remembered on this device. */
export function useCategoryFilter() {
  const [selected, setSelected] = useState<CalendarCategory[]>(readFilter)
  useEffect(() => writeFilter(selected), [selected])
  return {
    selected,
    toggle: (c: CalendarCategory) => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : CATEGORY_ORDER.filter((x) => x === c || s.includes(x)))),
    reset: () => setSelected([]),
  }
}

export const passes = (selected: CalendarCategory[]) => (e: CalendarEntry) => !selected.length || selected.includes(e.category)

// ─── Data ───────────────────────────────────────────────────────────────────

/** Lock state → what the calendar may show. Detail views reveal private titles when no lock is set up. */
export function usePrivacy() {
  const lock = useDB((db) => db.profile.privacyLock)
  const session = useLockState()
  const unlocked = !!session.unlockedAt
  return {
    gridReveal: !!lock?.enabled && unlocked,
    detailReveal: !lock?.enabled || unlocked,
    financeLocked: areaLocked(lock, 'dinheiro', session),
    careerLocked: areaLocked(lock, 'carreira', session),
  }
}

/** Entries + conflicts of a range (all categories; filter on top). */
export function useCalendar(from: DateKey, to: DateKey, today: DateKey) {
  const db = useDB()
  const p = usePrivacy()
  const entries = useMemo(
    () => calendarEntries(db, from, to, { today, revealPrivate: p.gridReveal, financeLocked: p.financeLocked, careerLocked: p.careerLocked }),
    [db, from, to, today, p.gridReveal, p.financeLocked, p.careerLocked],
  )
  const conflicts = useMemo(() => calendarConflicts(entries, db), [entries, db])
  const marks = useMemo(() => conflictIndex(conflicts), [conflicts])
  return { entries, conflicts, marks }
}

/** One entry, as the detail view may show it (private titles revealed when allowed). */
export function useEntry(sel: { id: string; date: DateKey } | undefined, today: DateKey): CalendarEntry | undefined {
  const db = useDB()
  const p = usePrivacy()
  return useMemo(() => {
    if (!sel) return undefined
    return calendarEntries(db, sel.date, sel.date, { today, revealPrivate: p.detailReveal, financeLocked: p.financeLocked, careerLocked: p.careerLocked, includeCancelled: true }).find((e) => e.id === sel.id)
  }, [db, sel, today, p.detailReveal, p.financeLocked, p.careerLocked])
}

/** Wide screens (tablet / desktop) get the detail as a side panel. */
export function useWide(query = '(min-width: 768px)'): boolean {
  const get = () => (typeof window !== 'undefined' && !!window.matchMedia?.(query).matches)
  const [wide, setWide] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setWide(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [query])
  return wide
}
