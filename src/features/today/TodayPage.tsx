/**
 * INÍCIO — the command center of the day and the week, calm by progressive disclosure:
 *   1. greeting + date + ONE smart line (or nothing)
 *   2. LUMOS — the way in (text, voice, prints, files; answers inline)
 *   3. HOJE IMPORTA (Top 3 — what matters most; never a replacement for the full list)
 *   4. HOJE — every real thing of the day, from every front, checkable in place
 *   5. PRÓXIMOS — tomorrow open, the next days one line each, "sem dia" folded
 * Discreet lines appear only when they carry something real: needs-attention (one row), 0–3 insights,
 * what changed since the last visit, a close trip. Rows are a projection (data/agenda/items.ts) over
 * the real records — nothing is copied into a Task.
 */
import { Suspense, useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { Page } from '@/components/ui'
import { changeFeed, dailyBrief, homeSuggestions, lifeContext, needsAttention, proactiveInsights, type Now } from '@/data/intel'
import { getDB, useDB } from '@/data/store'
import { dayItems, todaySections, undatedItems, upcomingDays } from '@/data/agenda/items'
import { areaLocked, useLockState } from '@/app/lock-store'
import { useNow } from '@/hooks/useToday'
import { formatLongDate, greeting } from '@/lib/date'
import { homeContext, tripPriorityItems } from './context'
import { prioritiesOf } from './priorities'
import { AttentionRow, ChangesLine, ImportaBlock, InsightLines, TripLine } from './home/blocks'
import { HojeBlock, ProximosBlock } from './home/agenda'
import { composerPlaceholder } from './home/day'
import { LumosBox } from './home/LumosBox'
import { LumosInline, lumosHref } from './home/lumos'
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

  // "o que mudou" is computed once, when Home opens; the baseline moves only when she leaves.
  const [changes] = useState(() => changeFeed(getDB(), now))
  useMarkSeenOnLeave()

  const home = useMemo(() => homeContext(db, today, minutes), [db, today, minutes])
  const life = useMemo(() => lifeContext(db, now), [db, now])
  const brief = useMemo(() => dailyBrief(db, now) ?? life.today.notes[0]?.value, [db, now, life])
  const suggestions = useMemo(() => homeSuggestions(db, now).slice(0, 3), [db, now])
  const attention = useMemo(() => needsAttention(db, now), [db, now])
  const insights = useMemo(() => proactiveInsights(db, now, 3), [db, now])
  const lock = useLockState()
  const hidden = useMemo(() => ({ carreira: areaLocked(db.profile.privacyLock, 'carreira', lock), dinheiro: areaLocked(db.profile.privacyLock, 'dinheiro', lock) }), [db.profile.privacyLock, lock])
  const items = useMemo(() => dayItems(db, today, today, { hidden }), [db, today, hidden])
  const sections = useMemo(() => todaySections(items, minutes), [items, minutes])
  const next = useMemo(() => upcomingDays(db, today, 6, { hidden }), [db, today, hidden])
  const undated = useMemo(() => undatedItems(db, today), [db, today])
  const priorities = useMemo(() => prioritiesOf(db, today), [db, today])

  const trip = useMemo(() => {
    if (life.nextTrip) return life.nextTrip.daysLeft <= TRIP_LINE_DAYS ? life.nextTrip : undefined
    const soon = home.tripSoon
    if (!soon) return undefined
    return { id: soon.trip.id, name: soon.trip.name, startDate: soon.trip.startDate ?? today, daysLeft: soon.days, openItems: tripPriorityItems(db, soon.trip, 99).length }
  }, [life.nextTrip, home.tripSoon, db, today])

  const [conversation, setConversation] = useState<{ text: string; n: number }>()
  const ask = useCallback(
    (text: string) => {
      if (LumosInline) setConversation((c) => ({ text, n: (c?.n ?? 0) + 1 }))
      else navigate(lumosHref(text))
    },
    [navigate],
  )
  // A print/PDF opens the conversation right here and is read there (same Lumos, same pipeline).
  const attach = useCallback((file: File, caption: string) => {
    setConversation((c) => ({ text: '', n: (c?.n ?? 0) + 1 }))
    void import('@/features/assistant/conversation').then((m) => m.sendAttachment(file, caption))
  }, [])
  const placeholder = composerPlaceholder(home.part, { workNow: home.part === 'dia' })
  const hasLines = attention.length > 0 || insights.length > 0 || changes.items.length > 0 || !!trip

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
          {brief && <p className="font-display italic text-[17px] text-ink-2 mt-3 leading-snug">{brief}</p>}
        </motion.div>
      </header>

      <motion.div {...rise(1)} className="mt-7">
        {conversation && LumosInline ? (
          <section aria-label="Conversa com a Lumos">
            <div className="flex items-center justify-between min-h-9 mb-1">
              <span className="eyebrow text-plum">Lumos</span>
              <button type="button" onClick={() => setConversation(undefined)} className="h-11 -mr-2 px-2 inline-flex items-center gap-1 text-[13px] text-muted">
                <X size={14} /> fechar conversa
              </button>
            </div>
            <Suspense fallback={<div className="h-24" />}>
              <LumosInline key={conversation.n} initial={conversation.text} />
            </Suspense>
          </section>
        ) : (
          <LumosBox placeholder={placeholder} suggestions={suggestions} onAsk={ask} onAttach={attach} />
        )}
      </motion.div>

      {hasLines && (
        <motion.div {...rise(2)} className="mt-6 space-y-1.5">
          <AttentionRow items={attention} onAsk={ask} />
          {/* The trip shows once, as its own line (with its to-dos and a check each) — not also as an insight. */}
          <InsightLines items={trip ? insights.filter((i) => !i.key.startsWith(`trip:${trip.id}`)) : insights} onAsk={ask} />
          <ChangesLine summary={changes.summary} items={changes.items} />
          {trip && <TripLine trip={trip} />}
        </motion.div>
      )}

      <motion.div {...rise(3)} className="mt-9">
        <ImportaBlock list={priorities} today={today} onAsk={ask} />
      </motion.div>

      <motion.div {...rise(4)} className="mt-8">
        <HojeBlock sections={sections} today={today} />
      </motion.div>

      <motion.div {...rise(5)} className="mt-9">
        <ProximosBlock days={next} undated={undated} today={today} />
      </motion.div>

      <p className="text-center font-display italic text-[14px] text-muted mt-14">em constante movimento: corpo, mente e vida.</p>
    </Page>
  )
}
