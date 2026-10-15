/**
 * INÍCIO — the command center of the day and the week, calm by progressive disclosure:
 *   1. greeting + date + ONE smart line (or nothing)
 *   2. LUMOS — the way in (text, voice, prints, files; answers in a sheet over the page)
 *   3. a quiet strip ONLY when something needs a decision (precisa de você · a close trip), one line each
 *   4. AGORA — max 3: happening, soon, overdue
 *   5. HOJE — ONE list of everything completable today from every area (filter by area), feitos folded
 *   6. PRÓXIMOS DIAS — one summary line per day (tap = its rows), "sem dia"/radar folded
 * Every list is the standard ItemRow; tapping a row opens the one quick-edit sheet (Dia · Hora · Obs).
 * Rows are a projection (data/agenda/items.ts) over the real records — nothing is copied into a Task.
 */
import { Suspense, useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ROUTES } from '@/app/routes'
import { Page } from '@/components/ui'
import { dailyBrief, homeSuggestions, lifeContext, needsAttention, type Now } from '@/data/intel'
import { useDB } from '@/data/store'
import { dayItems, undatedItems, upcomingDays } from '@/data/agenda/items'
import { radarItems } from '@/data/briefing/backlog'
import { areaLocked, useLockState } from '@/app/lock-store'
import { useNow } from '@/hooks/useToday'
import { formatLongDate, greeting } from '@/lib/date'
import { homeContext, tripPriorityItems } from './context'
import { MAX_PRIORITIES, prioritiesOf } from './priorities'
import { AttentionRow, TripLine } from './home/blocks'
import { AgoraBlock, HojeBlock, ProximosBlock } from './home/agenda'
import { dayProgress, homeLists, loosePriorities } from './home/rows'
import { DayProgressLine } from './home/progress'
import { composerPlaceholder } from './home/day'
import { LumosBox } from './home/LumosBox'
import { LumosSheet, lumosHref, type LumosRequest } from './home/lumos'
import { useMarkSeenOnLeave } from './home/seen'

/** A trip shows on Home only when it's really close. */
const TRIP_LINE_DAYS = 30

const rise = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay: 0.05 + i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
})

export default function TodayPage() {
  const db = useDB()
  const { today, minutes, now: clock } = useNow()
  const navigate = useNavigate()
  const now: Now = useMemo(() => ({ date: today, minutes, iso: clock.toISOString() }), [today, minutes, clock])
  const name = db.profile.name?.trim() || 'Marina'

  // The "seen" baseline still moves when she leaves (Lumos uses it for "o que mudou").
  useMarkSeenOnLeave()

  const home = useMemo(() => homeContext(db, today, minutes), [db, today, minutes])
  const life = useMemo(() => lifeContext(db, now), [db, now])
  const brief = useMemo(() => dailyBrief(db, now) ?? life.today.notes[0]?.value, [db, now, life])
  const suggestions = useMemo(() => homeSuggestions(db, now).slice(0, 3), [db, now])
  const attention = useMemo(() => needsAttention(db, now), [db, now])
  const lock = useLockState()
  const hidden = useMemo(() => ({ carreira: areaLocked(db.profile.privacyLock, 'carreira', lock), dinheiro: areaLocked(db.profile.privacyLock, 'dinheiro', lock) }), [db.profile.privacyLock, lock])
  const items = useMemo(() => dayItems(db, today, today, { hidden }), [db, today, hidden])
  const lists = useMemo(() => homeLists(items, minutes), [items, minutes])
  const next = useMemo(() => upcomingDays(db, today, 7, { hidden }), [db, today, hidden])
  const undated = useMemo(() => undatedItems(db, today), [db, today])
  const radar = useMemo(() => radarItems(db, today), [db, today])
  const loose = useMemo(() => loosePriorities(prioritiesOf(db, today).slice(0, MAX_PRIORITIES), items), [db, today, items])
  const progress = useMemo(() => dayProgress(lists, loose), [lists, loose])

  const trip = useMemo(() => {
    if (life.nextTrip) return life.nextTrip.daysLeft <= TRIP_LINE_DAYS ? life.nextTrip : undefined
    const soon = home.tripSoon
    if (!soon) return undefined
    return { id: soon.trip.id, name: soon.trip.name, startDate: soon.trip.startDate ?? today, daysLeft: soon.days, openItems: tripPriorityItems(db, soon.trip, 99).length }
  }, [life.nextTrip, home.tripSoon, db, today])

  // Answers slide up in the Lumos sheet over the page — Home itself never moves.
  const [lumos, setLumos] = useState<LumosRequest>()
  const ask = useCallback(
    (text: string) => {
      if (LumosSheet) setLumos((c) => ({ text, n: (c?.n ?? 0) + 1 }))
      else navigate(lumosHref(text))
    },
    [navigate],
  )
  // A print/PDF is read in the same sheet (same Lumos, same pipeline).
  const attach = useCallback((file: File, caption: string) => setLumos((c) => ({ file, caption, n: (c?.n ?? 0) + 1 })), [])
  const placeholder = composerPlaceholder(home.part, { workNow: home.part === 'dia' })
  const hasStrip = attention.length > 0 || !!trip

  return (
    <Page>
      <header className="pt-2">
        <div className="flex items-center justify-between min-h-11">
          <span className="text-[11px] tracking-[0.22em] uppercase text-muted font-semibold">Marina OS</span>
          <button
            type="button"
            onClick={() => navigate(ROUTES.settings)}
            aria-label="Ajustes e perfil"
            className="h-11 w-11 -mr-1.5 inline-flex items-center justify-center rounded-full active:scale-95 transition"
          >
            <span className="h-9 w-9 rounded-full bg-accent-soft text-accent font-display text-[17px] inline-flex items-center justify-center">{name.slice(0, 1).toUpperCase()}</span>
          </button>
        </div>
        <motion.div {...rise(0)}>
          <h1 className="font-display text-[34px] leading-[1.08] tracking-tight mt-4">
            {greeting(minutes)}, {name}.
          </h1>
          <p className="text-[15px] text-muted mt-1 first-letter:uppercase">{formatLongDate(today)}.</p>
          <DayProgressLine {...progress} />
          {brief && <p className="font-display italic text-[17px] text-ink-2 mt-3 leading-snug">{brief}</p>}
        </motion.div>
      </header>

      <motion.div {...rise(1)} className="mt-7">
        <LumosBox placeholder={placeholder} suggestions={suggestions} onAsk={ask} onAttach={attach} />
      </motion.div>
      {lumos && LumosSheet && (
        <Suspense fallback={null}>
          <LumosSheet request={lumos} />
        </Suspense>
      )}

      {hasStrip && (
        <motion.div {...rise(2)} className="mt-5">
          <AttentionRow items={attention} onAsk={ask} />
          {trip && <TripLine trip={trip} />}
        </motion.div>
      )}

      {lists.agora.length > 0 && (
        <motion.div {...rise(3)} className="mt-7">
          <AgoraBlock items={lists.agora} today={today} minutes={minutes} />
        </motion.div>
      )}

      <motion.div {...rise(4)} className="mt-7">
        <HojeBlock lists={lists} loose={loose} today={today} minutes={minutes} />
      </motion.div>

      <motion.div {...rise(5)} className="mt-9">
        <ProximosBlock days={next} undated={undated} radar={radar} today={today} />
      </motion.div>

      <p className="text-center font-display italic text-[14px] text-muted mt-14">em constante movimento: corpo, mente e vida.</p>
    </Page>
  )
}
