/**
 * INÍCIO — clean on purpose (MARINA OS 2.0, "sem texto desnecessário"). Top to bottom, nothing else:
 *   1. one line: "Sexta, 6 nov · Cape Town" (+ the avatar → Ajustes)
 *   2. HOJE — today's commitments from the universal calendar (the Agenda's own projection), one line each:
 *      time (or "dia todo") · title · tiny status chip. Tap = the Agenda's entry detail. Empty = "Dia livre".
 *   3. PRÓXIMOS DIAS — the next 3 days with something, up to 3 rows each, "Ver agenda".
 *   4. PRECISA DE VOCÊ — max 3 one-liners (trip: unpaid bookings, next leg, answers awaited; otherwise
 *      overdue + the attention queue). "Ver tudo" → the trip's command center (or Tarefas).
 *   5. one chip line for the trip: "✈︎ SA366 em 7 dias" · "Saldo R 12.459" → the trip.
 *   + one small Lumos line at the very end.
 * Everything that used to be here stays one tap away: the full trip panel (pendências, gastos, agenda,
 * entregas, conflitos) and the expedition day live on the trip page (Hoje); the full day list, checks and
 * priorities in Agenda / Tarefas; Lumos with voice and attachments on /lumos.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { Page } from '@/components/ui'
import { SheetFrame } from '@/components/ui/Sheet'
import { lifeContext, needsAttention, type Now } from '@/data/intel'
import { useDB } from '@/data/store'
import type { DateKey, DB } from '@/data/types'
import { dayItems } from '@/data/agenda/items'
import { deviceTimeZone, type CalendarEntry } from '@/data/calendar/universal'
import { areaLocked, useLockState } from '@/app/lock-store'
import { useNow } from '@/hooks/useToday'
import { addDays } from '@/lib/date'
import { travelTripOn } from '@/data/travel-mode'
import { activeDay } from './local-day'
import { checkinOf } from './home/day-checkin'
import { DayCheckinCard, DayReviewCard, showReview } from './home/DayPlanCards'
import { applyModeOf, applyProposal, blockRows } from './home/allocation'
import { BlockSheet, DayAssist, parseAdjust, runAdjust } from './home/DayAssist'
import { backlogOf } from './home/backlog'
import { BacklogPanel } from './home/BacklogPanel'
import { dayBlocksOn } from '@/data/routine-modes'
import { toast } from '@/app/ui-store'
import { EntryDetail } from '@/features/agenda/calendar/EntryDetail'
import { useCalendar, useEntry } from '@/features/agenda/calendar/model'
import { homeContext } from './context'
import { LumosSheet, lumosHref, type LumosRequest } from './home/lumos'
import { useMarkSeenOnLeave } from './home/seen'
import { homeTripOps } from './home/trip-ops'
import { blockLabel, flightName, headerDate, inDays, lifeNeeds, looseRows, nextDays, NEEDS_MAX, routineRows, shortMoney, stayPlace, timedRows, tripNeeds, type LooseRow, type Need } from './home/clean'
import { ConflictList, CrmLine, DayBlock, LumosLine, PrecisaList, ProximosList, RoutineChecklist, TripChips, type TLBlock, type TLItem } from './home/CleanBlocks'
import { crmPulse } from '@/data/ugc/model'

/** A trip shows on Home (outside it) only when it's really close. */
const TRIP_LINE_DAYS = 30
/** How far Home reads the calendar (Próximos dias looks for 3 days with something in this window). */
const HORIZON = 14
const CONFLICT_DAYS = 8

/** The trip's place while traveling ("Cape Town"); nothing otherwise. */
function placeOf(db: DB, today: DateKey, localDay: DateKey = today): string | undefined {
  const trip = travelTripOn(db, today)
  if (!trip) return undefined
  return stayPlace(db.tripItems, trip.id, localDay) ?? trip.expedition?.weather?.label ?? trip.place?.split(/[·(,]/)[0]?.trim() ?? undefined
}

const rise = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: 0.04 + i * 0.05, ease: [0.22, 1, 0.36, 1] as const },
})

export default function TodayPage() {
  const db = useDB()
  const { today, minutes, now: clock } = useNow()
  const navigate = useNavigate()
  const name = db.profile.name?.trim() || 'Marina'

  // The "seen" baseline still moves when she leaves (Lumos uses it for "o que mudou").
  useMarkSeenOnLeave()

  // While traveling, "today" is the trip's local day (the calendar stores trip times in its zone).
  const local = useMemo(() => activeDay(db, today, clock, minutes), [db, today, clock, minutes])
  const day = local.date
  const place = useMemo(() => placeOf(db, today, day), [db, today, day])

  // 2 · 3 — the same projection as the Agenda.
  const horizon = addDays(day, HORIZON)
  const cal = useCalendar(day, horizon, day)
  // Hoje and Amanhã are complete (timed lines + "Sem horário"); then the next 7 days with something.
  const tomorrow = addDays(day, 1)
  const hoje = useMemo(() => timedRows(cal.entries, day), [cal.entries, day])
  const hojeLoose = useMemo(() => looseRows(db, cal.entries, day), [db, cal.entries, day])
  const amanha = useMemo(() => timedRows(cal.entries, tomorrow), [cal.entries, tomorrow])
  const amanhaLoose = useMemo(() => looseRows(db, cal.entries, tomorrow), [db, cal.entries, tomorrow])
  const looseOf = useCallback((d: DateKey) => looseRows(db, cal.entries, d), [db, cal.entries])
  const proximos = useMemo(() => nextDays(cal.entries, tomorrow, undefined, undefined, undefined, (d) => looseOf(d).length > 0), [cal.entries, tomorrow, looseOf])
  const conflictIds = useMemo(() => new Set(cal.marks.keys()), [cal.marks])
  const dayCheckin = checkinOf(db, day)
  const rituals = useMemo(() => routineRows(db, day), [db, day])
  const [routineOpen, setRoutineOpen] = useState<string>()

  // ONE timeline: fixed commitments + the day's planned blocks (tasks, studies, prep) + rituals, by time.
  const blocks = useMemo(() => blockRows(db, day, local.minutes, cal.entries), [db, day, local.minutes, cal.entries])
  const mode = applyModeOf(db)
  // Auto mode: the first time she opens a day, the engine's proposal is placed (once; persisted; undoable).
  const applied = useRef<DateKey | undefined>(undefined)
  useEffect(() => {
    if (mode !== 'auto' || applied.current === day || dayCheckin?.blocks !== undefined || !cal.entries.length) return
    applied.current = day
    const r = applyProposal(day, local.minutes, cal.entries)
    if (r.changed && r.undo) toast(r.message, { action: { label: 'Desfazer', run: r.undo } })
  }, [mode, day, dayCheckin?.blocks, cal.entries, local.minutes])
  const timeline = useMemo<TLItem[]>(() => {
    const out: TLItem[] = hoje.map((e) => ({ kind: 'entry', time: e.startAt.time ?? '', e }))
    for (const b of blocks.rows) out.push({ kind: 'block', time: b.start, b, label: blockLabel(db, b.key, b.c) })
    for (const r of rituals) out.push({ kind: 'routine', time: r.time ?? '99:99', r })
    for (const q of dayBlocksOn(db, day)) {
      if (q.kind === 'base' && (q.category === 'almoco' || q.category === 'descanso')) out.push({ kind: 'quiet', time: q.start, title: q.title, onOpen: () => navigate(ROUTES.routineSettings) })
    }
    const sleep = db.profile.rhythm?.sleepTime
    if (sleep) out.push({ kind: 'quiet', time: sleep, title: 'Dormir', onOpen: () => navigate(ROUTES.routineSettings) })
    return out.sort((a, b) => a.time.localeCompare(b.time))
  }, [hoje, blocks.rows, rituals, db, day, navigate])
  const [blockOpen, setBlockOpen] = useState<TLBlock>()
  const backlog = useMemo(() => backlogOf(db, day, new Set(blocks.rows.map((b) => b.key))), [db, day, blocks.rows])
  // 0 — Check-in do dia → "O que faz sentido fazer agora?" (+ the optional review after 20:00).

  const conflicts = useMemo(() => {
    const until = addDays(day, CONFLICT_DAYS)
    return cal.conflicts.filter((c) => c.date >= day && c.date <= until)
  }, [cal.conflicts, day])
  // Each conflict shows on its own day: "Hoje" counts only today's, Próximos dias marks the others.
  const conflictsByDay = useMemo(() => {
    const m = new Map<DateKey, number>()
    for (const c of conflicts) m.set(c.date, (m.get(c.date) ?? 0) + 1)
    return m
  }, [conflicts])

  // 4 — Precisa de você.
  const lock = useLockState()
  const hidden = useMemo(() => ({ carreira: areaLocked(db.profile.privacyLock, 'carreira', lock), dinheiro: areaLocked(db.profile.privacyLock, 'dinheiro', lock) }), [db.profile.privacyLock, lock])
  const ops = useMemo(() => homeTripOps(db, today, clock), [db, today, clock])
  const now: Now = useMemo(() => ({ date: today, minutes, iso: clock.toISOString() }), [today, minutes, clock])
  const items = useMemo(() => dayItems(db, today, today, { hidden }), [db, today, hidden])
  const attention = useMemo(() => needsAttention(db, now), [db, now])
  const needs = useMemo(() => {
    const trip = ops ? tripNeeds(ops, { hideMoney: hidden.dinheiro }) : []
    return [...trip, ...lifeNeeds(items, attention)].slice(0, NEEDS_MAX)
  }, [ops, hidden.dinheiro, items, attention])
  const needsHref = ops ? ROUTES.trip(ops.trip.id) : ROUTES.tasks

  // 5 — one chip line for the trip (during it: next flight + the balance she typed; before it: the countdown).
  const life = useMemo(() => lifeContext(db, now), [db, now])
  const home = useMemo(() => homeContext(db, today, minutes), [db, today, minutes])
  const chips = useMemo(() => {
    if (ops) {
      const f = ops.flight
      const w = ops.wallet
      return {
        to: ROUTES.trip(ops.trip.id),
        label: `Abrir a viagem: ${ops.trip.name}`,
        flight: f ? `${flightName(f.item.title)} ${inDays(f.days)}` : undefined,
        balance: w && !hidden.dinheiro ? shortMoney(w.cents, ops.finance.currency) : undefined,
      }
    }
    const soon = life.nextTrip && life.nextTrip.daysLeft <= TRIP_LINE_DAYS ? { id: life.nextTrip.id, name: life.nextTrip.name, days: life.nextTrip.daysLeft } : home.tripSoon ? { id: home.tripSoon.trip.id, name: home.tripSoon.trip.name, days: home.tripSoon.days } : undefined
    return soon ? { to: ROUTES.trip(soon.id), label: `Abrir a viagem: ${soon.name}`, flight: `${soon.name} ${inDays(soon.days)}`, balance: undefined } : undefined
  }, [ops, hidden.dinheiro, life.nextTrip, home.tripSoon])

  // 6 — one line for the CRM, only when there are open opportunities.
  const crm = useMemo(() => crmPulse(db, today), [db, today])

  // Detail of a row: the Agenda's own entry detail, over Home.
  const [sel, setSel] = useState<{ id: string; date: DateKey }>()
  const detail = useEntry(sel, day)
  const device = useMemo(() => deviceTimeZone(), [])
  const [showConflicts, setShowConflicts] = useState<DateKey>()
  const openEntry = useCallback((e: CalendarEntry, d: DateKey) => setSel({ id: e.id, date: d }), [])
  const openLoose = useCallback((r: LooseRow) => {
    if (r.open.kind === 'task') openSheet('task', { id: r.open.id })
    else setSel({ id: r.open.entry.id, date: r.open.entry.startAt.date })
  }, [])

  // Lumos answers slide up in its sheet over the page — Home itself never moves.
  const [lumos, setLumos] = useState<LumosRequest>()
  const ask = useCallback(
    (text: string) => {
      // "tenho mais 30 minutos", "estou cansada", "não quero idiomas"… change the day's timeline for real.
      const adj = parseAdjust(text)
      if (adj) {
        const r = runAdjust(adj, day, local.minutes, cal.entries)
        toast(r.message, r.undo ? { action: { label: 'Desfazer', run: r.undo } } : {})
        return
      }
      if (LumosSheet) setLumos((c) => ({ text, n: (c?.n ?? 0) + 1 }))
      else navigate(lumosHref(text))
    },
    [navigate, day, local.minutes, cal.entries],
  )

  const openNeed = (n: Need) => {
    const o = n.open
    if (o.kind === 'tripItem') openSheet('tripItem', { id: o.id })
    else if (o.kind === 'item') openSheet('itemEdit', { item: o.item, today })
    else if (o.kind === 'ask') ask(o.text)
    else navigate(o.to)
  }

  return (
    <Page>
      <header className="pt-2 flex items-center justify-between gap-3 min-h-11">
        <motion.p {...rise(0)} className="font-display text-[22px] leading-tight tracking-tight truncate">
          {headerDate(day)}
          {place && <span className="text-muted"> · {place}</span>}
        </motion.p>
        <button
          type="button"
          onClick={() => navigate(ROUTES.settings)}
          aria-label="Ajustes e perfil"
          className="h-11 w-11 -mr-1.5 shrink-0 inline-flex items-center justify-center rounded-full active:scale-95 transition"
        >
          <span className="h-9 w-9 rounded-full bg-accent-soft text-accent font-display text-[17px] inline-flex items-center justify-center">{name.slice(0, 1).toUpperCase()}</span>
        </button>
      </header>

      <motion.div {...rise(1)} className="mt-5 grid gap-4">
        {!dayCheckin?.energy && !dayCheckin?.skipped && <DayCheckinCard key={day} date={day} nowMin={local.minutes} entries={cal.entries} />}
        {dayCheckin && showReview(local.minutes, dayCheckin.review) && <DayReviewCard date={day} />}
      </motion.div>

      <motion.div {...rise(1)} className="mt-7">
        <DayBlock label="01 / Dia" title="Hoje" rows={hoje} loose={hojeLoose} onOpen={(e) => openEntry(e, day)} onLoose={openLoose} conflicts={conflictsByDay.get(day) ?? 0} conflictIds={conflictIds} onConflicts={() => setShowConflicts(day)} items={timeline} onBlock={setBlockOpen} onRoutine={setRoutineOpen} />
        <DayAssist date={day} nowMin={local.minutes} entries={cal.entries} rows={blocks.rows} onAsk={ask} />
        <BacklogPanel items={backlog} today={day} onOpen={(id) => openSheet('task', { id })} />
      </motion.div>

      <motion.div {...rise(2)} className="mt-7">
        <DayBlock label={`02 / ${headerDate(tomorrow)}`} title="Amanhã" rows={amanha} loose={amanhaLoose} onOpen={(e) => openEntry(e, tomorrow)} onLoose={openLoose} conflicts={conflictsByDay.get(tomorrow) ?? 0} conflictIds={conflictIds} onConflicts={() => setShowConflicts(tomorrow)} empty="Nada marcado" />
      </motion.div>

      <motion.div {...rise(2)} className="mt-7">
        <ProximosList label="03 / Agenda" days={proximos} today={day} onOpen={openEntry} agendaHref={ROUTES.agenda} conflicts={conflictsByDay} onConflicts={setShowConflicts} conflictIds={conflictIds} looseOf={looseOf} onLoose={openLoose} />
      </motion.div>

      {needs.length > 0 && (
        <motion.div {...rise(3)} className="mt-7">
          <PrecisaList label="04 / Pendências" needs={needs} onOpen={openNeed} allHref={needsHref} />
        </motion.div>
      )}

      {chips && (
        <motion.div {...rise(4)} className="mt-7">
          <TripChips {...chips} />
        </motion.div>
      )}

      {crm && (
        <motion.div {...rise(5)} className="mt-5">
          <CrmLine waiting={crm.waiting} action={crm.action} to={`${ROUTES.ugc}?aba=marcas`} />
        </motion.div>
      )}

      <motion.div {...rise(6)} className="mt-9">
        <LumosLine onAsk={ask} />
      </motion.div>

      {lumos && LumosSheet && (
        <Suspense fallback={null}>
          <LumosSheet request={lumos} />
        </Suspense>
      )}

      <AnimatePresence>
        {detail && sel && (
          <SheetFrame key="detail" onClose={() => setSel(undefined)} label="Detalhe do compromisso" maxHeight="86dvh">
            <EntryDetail entry={detail} date={sel.date} conflicts={cal.marks.get(detail.id)} device={device} onClose={() => setSel(undefined)} onEdited={() => setSel(undefined)} />
          </SheetFrame>
        )}
        {blockOpen && (
          <SheetFrame key="block" onClose={() => setBlockOpen(undefined)} label="Bloco do dia">
            <BlockSheet
              row={blockOpen.b}
              label={blockOpen.label}
              date={day}
              nowMin={local.minutes}
              entries={cal.entries}
              onDone={(o) => {
                setBlockOpen(undefined)
                toast(o.message, o.undo ? { action: { label: 'Desfazer', run: o.undo } } : {})
              }}
            />
          </SheetFrame>
        )}
        {routineOpen && (
          <SheetFrame key="routine" onClose={() => setRoutineOpen(undefined)} label="Rotina">
            <RoutineChecklist routineId={routineOpen} date={day} />
          </SheetFrame>
        )}
        {showConflicts && !sel && (
          <SheetFrame key="conflicts" onClose={() => setShowConflicts(undefined)} label="Conflitos">
            <ConflictList conflicts={conflicts.filter((c) => c.date === showConflicts)} onOpenEntry={(id, date) => setSel({ id, date })} />
          </SheetFrame>
        )}
      </AnimatePresence>
    </Page>
  )
}
