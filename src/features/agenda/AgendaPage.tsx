/**
 * Agenda — the ONE calendar of her life (route /agenda).
 * Everything with a date comes from `calendarEntries` (a projection of the records where they live):
 * events, workouts, timed tasks and deadlines, work hours, the trip's class and activities, Luna, bills
 * and receivables… Views: Dia · Semana · Mês · Lista. Category chips filter without leaving the
 * consolidated view. Tap an entry → its detail (side panel on wide screens); editing is a second step.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { CalendarClock, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, Ellipsis, Gauge, TriangleAlert } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { Button, Chip, IconButton, Page, PageHeader, Segmented } from '@/components/ui'
import { SheetFrame } from '@/components/ui/Sheet'
import type { DateKey } from '@/data/types'
import { CATEGORY_META, CATEGORY_ORDER, deviceTimeZone, entriesOn, isTimed, type CalendarEntry } from '@/data/calendar/universal'
import { useNow } from '@/hooks/useToday'
import { formatLongDate, formatMonth, formatShortDate, hmToMinutes, isDateKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { findFreeSlots, freeLabel } from './free-slots'
import { rangeLabel } from './selectors'
import { SourcesPanel } from './SourcesPanel'
import { EntryDetail } from './calendar/EntryDetail'
import { LIST_DAYS, parseView, passes, shiftDate, useCalendar, useCategoryFilter, useEntry, useWide, viewRange, VIEWS, type CalendarView } from './calendar/model'
import { DayView, ListView, MonthView, WeekView } from './calendar/Views'

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase())

export default function AgendaPage() {
  const { today, minutes } = useNow()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = parseView(params.get('v'))
  const dParam = params.get('d')
  const date: DateKey = isDateKey(dParam) ? dParam : today
  const [listDays, setListDays] = useState(LIST_DAYS)
  const [sel, setSel] = useState<{ id: string; date: DateKey }>()
  const [menu, setMenu] = useState(false)
  const wide = useWide()
  const device = useMemo(() => deviceTimeZone(), [])
  const filter = useCategoryFilter()

  const set = (patch: { v?: CalendarView; d?: DateKey }) => {
    const next = new URLSearchParams(params)
    if (patch.v) next.set('v', patch.v)
    if (patch.d) next.set('d', patch.d)
    if (next.get('v') === 'dia') next.delete('v')
    if (next.get('d') === today) next.delete('d')
    setParams(next, { replace: true })
  }

  const { from, to } = viewRange(view, date, listDays)
  const { entries, conflicts, marks } = useCalendar(from, to, today)
  const shown = useMemo(() => entries.filter(passes(filter.selected)), [entries, filter.selected])
  const shownConflicts = useMemo(() => {
    const ids = new Set(shown.map((e) => e.id))
    return conflicts.filter((c) => c.ids.some((id) => ids.has(id)))
  }, [conflicts, shown])

  // Today's line under the title: what's now / next (from the same consolidated entries).
  const todayRange = useCalendar(today, today, today)
  const subtitle = useMemo(() => {
    const timed = entriesOn(todayRange.entries, today).filter((e) => isTimed(e) && !e.base && !e.suggested && !e.approx && e.status !== 'feito' && e.status !== 'cancelado')
    const now = timed.find((e) => hmToMinutes(e.startAt.time!) <= minutes && minutes < hmToMinutes(e.endAt.time ?? e.startAt.time!))
    const next = timed.find((e) => hmToMinutes(e.startAt.time!) > minutes)
    if (now) return `agora: ${now.title}${next ? ` · depois, ${next.startAt.time} ${next.title}` : ''}`
    if (next) return `próximo: ${next.startAt.time} ${next.title}`
    return timed.length ? 'compromissos de hoje feitos' : 'nada mais com horário hoje'
  }, [todayRange.entries, today, minutes])

  const label =
    view === 'dia'
      ? cap(formatLongDate(date))
      : view === 'semana'
        ? rangeLabel(from, to)
        : view === 'mes'
          ? cap(formatMonth(date))
          : `A partir de ${formatShortDate(date)}`

  const open = (e: CalendarEntry, d: DateKey) => {
    haptic('light')
    setSel({ id: e.id, date: d })
  }
  const detail = useEntry(sel, today)
  const close = () => setSel(undefined)
  const onNew = (time?: string) => {
    haptic('light')
    openSheet('event', { date: view === 'dia' || view === 'mes' ? date : today, time })
  }
  const go = (dir: 1 | -1) => {
    haptic('light')
    set({ d: shiftDate(view, date, dir) })
  }
  const onPanEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 70 || Math.abs(info.offset.x) < Math.abs(info.offset.y) * 1.6) return
    go(info.offset.x < 0 ? 1 : -1)
  }

  const viewProps = { entries: shown, marks, conflicts: shownConflicts, today, selectedId: sel?.id, onOpen: open }
  const detailNode = detail && sel && (
    <EntryDetail
      key={detail.id}
      entry={detail}
      date={sel.date}
      conflicts={marks.get(detail.id)}
      device={device}
      onClose={close}
      onEdited={wide ? undefined : close}
    />
  )

  return (
    <Page className="md:max-w-[1180px]">
      <PageHeader
        eyebrow={formatLongDate(today)}
        title="Agenda"
        subtitle={subtitle}
        actions={
          <>
            <IconButton label="Minha semana" onClick={() => nav(ROUTES.myWeek)}>
              <Gauge size={20} />
            </IconButton>
            <IconButton label="Novo compromisso" onClick={() => onNew()}>
              <CalendarPlus size={20} />
            </IconButton>
            <IconButton label="Mais opções da agenda" onClick={() => setMenu(true)}>
              <Ellipsis size={20} />
            </IconButton>
          </>
        }
      />

      <div className="sticky top-0 z-20 -mx-4 px-4 pb-2 pt-[max(env(safe-area-inset-top),8px)] bg-bg/90 backdrop-blur-md space-y-2">
        <Segmented value={view} onChange={(v) => set({ v })} options={VIEWS} />
        <div className="flex items-center gap-1">
          <IconButton label="Anterior" onClick={() => go(-1)}>
            <ChevronLeft size={20} />
          </IconButton>
          <div className="flex-1 min-w-0 text-center">
            <div className="font-display text-[18px] leading-tight truncate" aria-live="polite">
              {label}
            </div>
          </div>
          <IconButton label="Próximo" onClick={() => go(1)}>
            <ChevronRight size={20} />
          </IconButton>
          <Button variant={date === today ? 'ghost' : 'soft'} size="sm" onClick={() => set({ d: today })} aria-label="Ir para hoje">
            Hoje
          </Button>
        </div>
        <div role="group" aria-label="Filtrar por categoria" className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
          <Chip selected={!filter.selected.length} onClick={filter.reset} className="h-8 px-3 text-[13px]">
            Tudo
          </Chip>
          {CATEGORY_ORDER.map((c) => (
            <Chip key={c} selected={filter.selected.includes(c)} onClick={() => filter.toggle(c)} className="h-8 px-3 text-[13px]">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: CATEGORY_META[c].color }} />
              {CATEGORY_META[c].label}
            </Chip>
          ))}
        </div>
        {filter.selected.length > 0 && (
          <div className="text-[12px] text-muted px-1">
            Mostrando {filter.selected.map((c) => CATEGORY_META[c].label.toLowerCase()).join(', ')} · {shown.length} de {entries.length} no período.{' '}
            <button type="button" className="underline underline-offset-2" onClick={filter.reset}>
              ver tudo
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:gap-6 md:items-start">
        <div className="min-w-0">
          {view === 'dia' && (
            <motion.div onPanEnd={onPanEnd} style={{ touchAction: 'pan-y' }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={date} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                  <DayView {...viewProps} date={date} device={device} nowMinutes={date === today ? minutes : undefined} onNew={onNew} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
          {view === 'semana' && <WeekView {...viewProps} from={from} onOpenDay={(d) => set({ v: 'dia', d })} />}
          {view === 'mes' && <MonthView {...viewProps} date={date} from={from} to={to} onSelectDay={(d) => set({ d })} onOpenDay={(d) => set({ v: 'dia', d })} />}
          {view === 'lista' && <ListView {...viewProps} from={from} to={to} onMore={() => setListDays((n) => n + LIST_DAYS)} onOpenDay={(d) => set({ v: 'dia', d })} />}
        </div>

        {wide && (
          <aside aria-label="Detalhe" className="hidden md:flex flex-col sticky top-[176px] max-h-[calc(100dvh-196px)] card p-0 pt-4 overflow-hidden">
            {detailNode ?? <div className="px-5 pb-6 text-[13.5px] text-muted">Toque num compromisso para ver o que é, quando, status e de onde vem.</div>}
          </aside>
        )}
      </div>

      <AnimatePresence>
        {!wide && detailNode && (
          <SheetFrame key="detail" onClose={close} label="Detalhe do compromisso" maxHeight="86dvh">
            {detailNode}
          </SheetFrame>
        )}
        {menu && (
          <SheetFrame key="menu" onClose={() => setMenu(false)} label="Mais opções da agenda">
            <MoreMenu
              date={view === 'dia' ? date : today}
              entries={entries}
              conflicts={conflicts.length}
              onConflicts={() => {
                setMenu(false)
                openSheet('conflicts', { from, to })
              }}
              onWeek={() => nav(ROUTES.weekPlanner)}
              onClose={() => setMenu(false)}
            />
          </SheetFrame>
        )}
      </AnimatePresence>
    </Page>
  )
}

/** Secondary tools kept from the old Agenda: free time, conflicts, week planner, calendars & .ics. */
function MoreMenu({
  date,
  entries,
  conflicts,
  onConflicts,
  onWeek,
  onClose,
}: {
  date: DateKey
  entries: CalendarEntry[]
  conflicts: number
  onConflicts: () => void
  onWeek: () => void
  onClose: () => void
}) {
  const slots = useMemo(() => {
    const timed = entriesOn(entries, date).filter(isTimed).map((e) => ({ time: e.startAt.time, endTime: e.endAt.time }))
    return findFreeSlots(timed, { from: '06:00', to: '21:00', minMinutes: 60 })
  }, [entries, date])
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[22px]">Agenda</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      </div>
      <section>
        <div className="eyebrow mb-1.5 flex items-center gap-1.5">
          <CalendarClock size={13} aria-hidden /> Horários livres · {formatShortDate(date)}
        </div>
        {slots.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {slots.map((s) => (
              <li key={s.start} className="h-8 px-3 rounded-full bg-sage-soft text-[13px] inline-flex items-center">
                {freeLabel(s)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-muted">Sem janela de 1 h livre entre 06:00 e 21:00.</p>
        )}
      </section>
      <div className="grid gap-2">
        <Button variant="soft" className="justify-start" icon={<TriangleAlert size={16} />} onClick={onConflicts}>
          Pontos de atenção do período{conflicts ? ` · ${conflicts}` : ''}
        </Button>
        <Button variant="soft" className="justify-start" icon={<CalendarRange size={16} />} onClick={onWeek}>
          Planejar a semana
        </Button>
      </div>
      <div className="pt-1">
        <SourcesPanel />
      </div>
    </div>
  )
}

