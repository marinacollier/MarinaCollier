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
import { Suspense, useCallback, useMemo, useState } from 'react'
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
import { localNow } from '@/features/travel/expedition/logic'
import { EntryDetail } from '@/features/agenda/calendar/EntryDetail'
import { useCalendar, useEntry } from '@/features/agenda/calendar/model'
import { homeContext } from './context'
import { LumosSheet, lumosHref, type LumosRequest } from './home/lumos'
import { useMarkSeenOnLeave } from './home/seen'
import { homeTripOps } from './home/trip-ops'
import { dayRows, flightName, headerDate, inDays, lifeNeeds, nextDays, NEEDS_MAX, shortMoney, tripNeeds, type Need } from './home/clean'
import { ConflictList, HojeList, LumosLine, PrecisaList, ProximosList, TripChips } from './home/CleanBlocks'

/** A trip shows on Home (outside it) only when it's really close. */
const TRIP_LINE_DAYS = 30
/** How far Home reads the calendar (Próximos dias looks for 3 days with something in this window). */
const HORIZON = 14
const CONFLICT_DAYS = 7

/** The trip's place while traveling ("Cape Town"); nothing otherwise. */
function placeOf(db: DB, today: DateKey): string | undefined {
  const trip = travelTripOn(db, today)
  if (!trip) return undefined
  return trip.expedition?.weather?.label ?? trip.place?.split(/[·(,]/)[0]?.trim() ?? undefined
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
  const tz = travelTripOn(db, today)?.expedition?.timeZone
  const day = useMemo(() => {
    if (!tz) return today
    try {
      return localNow(tz, clock).date
    } catch {
      return today
    }
  }, [tz, today, clock])
  const place = useMemo(() => placeOf(db, today), [db, today])

  // 2 · 3 — the same projection as the Agenda.
  const horizon = addDays(day, HORIZON)
  const cal = useCalendar(day, horizon, day)
  const hoje = useMemo(() => dayRows(cal.entries, day), [cal.entries, day])
  const proximos = useMemo(() => nextDays(cal.entries, day), [cal.entries, day])
  const conflicts = useMemo(() => {
    const until = addDays(day, CONFLICT_DAYS)
    return cal.conflicts.filter((c) => c.date >= day && c.date <= until)
  }, [cal.conflicts, day])

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

  // Detail of a row: the Agenda's own entry detail, over Home.
  const [sel, setSel] = useState<{ id: string; date: DateKey }>()
  const detail = useEntry(sel, day)
  const device = useMemo(() => deviceTimeZone(), [])
  const [showConflicts, setShowConflicts] = useState(false)
  const openEntry = useCallback((e: CalendarEntry, d: DateKey) => setSel({ id: e.id, date: d }), [])

  // Lumos answers slide up in its sheet over the page — Home itself never moves.
  const [lumos, setLumos] = useState<LumosRequest>()
  const ask = useCallback(
    (text: string) => {
      if (LumosSheet) setLumos((c) => ({ text, n: (c?.n ?? 0) + 1 }))
      else navigate(lumosHref(text))
    },
    [navigate],
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

      <motion.div {...rise(1)} className="mt-5">
        <HojeList rows={hoje} onOpen={(e) => openEntry(e, day)} conflicts={conflicts.length} onConflicts={() => setShowConflicts(true)} />
      </motion.div>

      <motion.div {...rise(2)} className="mt-7">
        <ProximosList days={proximos} today={day} onOpen={openEntry} agendaHref={ROUTES.agenda} />
      </motion.div>

      {needs.length > 0 && (
        <motion.div {...rise(3)} className="mt-7">
          <PrecisaList needs={needs} onOpen={openNeed} allHref={needsHref} />
        </motion.div>
      )}

      {chips && (
        <motion.div {...rise(4)} className="mt-7">
          <TripChips {...chips} />
        </motion.div>
      )}

      <motion.div {...rise(5)} className="mt-9">
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
        {showConflicts && !sel && (
          <SheetFrame key="conflicts" onClose={() => setShowConflicts(false)} label="Conflitos">
            <ConflictList conflicts={conflicts} onOpenEntry={(id, date) => setSel({ id, date })} />
          </SheetFrame>
        )}
      </AnimatePresence>
    </Page>
  )
}
