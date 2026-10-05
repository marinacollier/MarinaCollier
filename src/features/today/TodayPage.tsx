/**
 * INÍCIO — "O que importa agora?"
 *
 * Five blocks, nothing else permanent:
 *   1. greeting + date + ONE smart line (or nothing)
 *   2. LUMOS — the main element (composer, voice, attachments, ≤3 suggestions; answers inline when available)
 *   3. AGORA / PRÓXIMO
 *   4. HOJE IMPORTA (max 3)
 *   5. RESTANTE DO DIA (a few relevant rows → the full Linha do dia on tap)
 * Discreet lines appear only when they carry something real: needs-attention (one row), 0–3 insights,
 * what changed since the last visit, a close trip. Modules (livros, finanças, Luna…) live in Espaços
 * or come up through Lumos.
 */
import { Suspense, useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { Page } from '@/components/ui'
import { changeFeed, dailyBrief, homeSuggestions, lifeContext, needsAttention, proactiveInsights, type Now } from '@/data/intel'
import { getDB, useDB } from '@/data/store'
import { dayTimeline } from '@/data/timeline'
import { useNow } from '@/hooks/useToday'
import { formatLongDate, greeting } from '@/lib/date'
import { homeContext, tripPriorityItems } from './context'
import { prioritiesOf } from './priorities'
import { AttentionRow, ChangesLine, ImportaBlock, InsightLines, NowBlock, RestBlock, TripLine } from './home/blocks'
import { composerPlaceholder, homeDay } from './home/day'
import { LumosBox } from './home/LumosBox'
import { LumosInline, lumosHref } from './home/lumos'
import { useMarkSeenOnLeave } from './home/seen'
import { LinhaDoDiaWidget } from './timeline/LinhaDoDia'

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
  const entries = useMemo(() => dayTimeline(db, today, { nowMinutes: minutes }), [db, today, minutes])
  const day = useMemo(() => homeDay(db, today, minutes, entries), [db, today, minutes, entries])
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
  const [fullDay, setFullDay] = useState(false)
  const placeholder = composerPlaceholder(home.part, { workNow: day.now.row?.kind === 'work' })
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
          <LumosBox placeholder={placeholder} suggestions={suggestions} onAsk={ask} />
        )}
      </motion.div>

      {hasLines && (
        <motion.div {...rise(2)} className="mt-6 space-y-1.5">
          <AttentionRow items={attention} onAsk={ask} />
          <InsightLines items={insights} onAsk={ask} />
          <ChangesLine summary={changes.summary} items={changes.items} />
          {trip && <TripLine trip={trip} />}
        </motion.div>
      )}

      <motion.div {...rise(3)} className="mt-9">
        <NowBlock day={day} today={today} onExpand={() => setFullDay(true)} />
      </motion.div>

      <motion.div {...rise(4)} className="mt-9">
        <ImportaBlock list={priorities} today={today} onAsk={ask} />
      </motion.div>

      <motion.div {...rise(5)} className="mt-8">
        <RestBlock day={day} today={today} expanded={fullDay} onExpand={() => setFullDay((f) => !f)} />
        {fullDay && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
            <LinhaDoDiaWidget ctx={{ db, today, minutes, part: home.part, home }} />
          </motion.div>
        )}
      </motion.div>

      <p className="text-center font-display italic text-[14px] text-muted mt-14">em constante movimento: corpo, mente e vida.</p>
    </Page>
  )
}
