import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUp, Sparkles } from 'lucide-react'
import { Chip, Page, PageHeader, SectionTitle, tone } from '@/components/ui'
import { describeFoods, saveAdjustment, toLoggedFood } from '@/data/nutrition'
import { useDB, useStore } from '@/data/store'
import type { DB, LoggedFood } from '@/data/types'
import { useNow } from '@/hooks/useToday'
import { useKeyboardInset } from '@/hooks/useKeyboardInset'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { runAction } from '@/features/search/actions'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { AnswerCard } from './AnswerCard'
import { AdjustCard, type AdjustStatus } from './adjust/AdjustCard'
import { applyPlan, undoPlan, type ApplySnapshot } from './adjust/apply'
import { ADJUST_EXAMPLES, visibleChanges } from './adjust/planner'
import type { ChangePlan } from './adjust/types'
import { askLumos, EXAMPLE_QUESTIONS } from './chief'
import { answerFood, type FoodReply } from './food/answer'
import { FoodAnswerCard, FoodLogCard, type FoodLogState } from './food/FoodCards'
import { logFromChat, needsAnswer, parseLog, type Savable } from './food/log'
import { MealPrepCard } from './food/MealPrepCard'
import { buildInsights, type Insight } from './insights'
import { ADJUST_PILL, GENERATIVE_PILL } from './llm'
import { understand, type LumosTurn } from './router'

/** "Lumos controla o dia" — examples with her own sentences. */
export const DAY_EXAMPLES = ['Amanhã cancelei meu inglês', 'Amanhã quero acordar 5h30', 'Acordei agora', ...ADJUST_EXAMPLES.slice(0, 1)]
export const FOOD_EXAMPLES = ['Comi um YoPRO', 'Como estão meus macros hoje?', 'Posso manter o jantar normal?', 'Faz minhas marmitas']

interface Exchange {
  id: number
  question: string
  /** Came from ?q= before the data was loaded: read it once it is. */
  fromLink?: boolean
  turn?: LumosTurn
  /** A change to the day / training (preview → Confirmar → Desfazer). */
  adjust?: { plan: ChangePlan; status: AdjustStatus }
  food?: FoodLogState
  reply?: FoodReply
  skipUndo?: () => void
  skipUndone?: boolean
}

let nextId = 1

/** Turn + the effects she asked for by saying it ("comi…", "não vou fazer lanche"), each with undo. */
function begin(db: DB, question: string, today: string, minutes: number, id = nextId++): Exchange {
  const turn = understand(db, question, today, minutes)
  const ex: Exchange = { id, question, turn }
  if (turn.kind === 'adjust') ex.adjust = { plan: turn.plan, status: 'preview' }
  if (turn.kind === 'foodLog') {
    const parsed = parseLog(db, turn.intent.text)
    if (!parsed.items.length && !needsAnswer(parsed)) {
      ex.turn = { kind: 'answer' }
      return ex
    }
    ex.food = needsAnswer(parsed) ? { status: 'resolving' } : logNow(parsed.items.map(toLoggedFood), [], turn.intent.at)
  }
  if (turn.kind === 'food') {
    const reply = answerFood(db, turn.intent, today, minutes)
    ex.reply = reply
    if (reply.skip) {
      ex.skipUndo = saveAdjustment(reply.skip.draft).undo
      haptic('success')
    }
  }
  return ex
}

function logNow(foods: LoggedFood[], savable: Savable[], at?: string): FoodLogState {
  const r = logFromChat({ foods, at })
  haptic('success')
  return {
    status: 'logged',
    mealId: r.meal.id,
    adjustmentIds: r.adjustments.map((a) => a.id),
    summary: r.adapt?.summary ?? `Registrei ${describeFoods(foods)} ✓`,
    autoApplied: r.autoApplied,
    foods,
    savable,
    undo: r.undo,
  }
}

export default function AssistantPage() {
  const db = useDB()
  const { today, minutes } = useNow()
  const navigate = useNavigate()
  const kb = useKeyboardInset()
  const [params, setParams] = useSearchParams()
  // The conversation lives only in this session (component state). Answers are recomputed from
  // live data, so ticking something from an answer updates it.
  const [exchanges, setExchanges] = useState<Exchange[]>(() => {
    const q = params.get('q')?.trim()
    return q ? [{ id: nextId++, question: q, fromLink: true }] : []
  })
  const hydrated = useStore((s) => s.hydrated)
  const [draft, setDraft] = useState('')
  const lastRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const snaps = useRef(new Map<number, ApplySnapshot>())

  useEffect(() => {
    if (params.get('q')) setParams({}, { replace: true })
  }, [params, setParams])

  const insights = useMemo(() => buildInsights(db, today, minutes), [db, today, minutes])
  const answers = useMemo(
    () => exchanges.map((e) => ({ ...e, answer: e.turn?.kind === 'answer' ? askLumos(db, e.question, today, minutes) : undefined })),
    [db, exchanges, today, minutes],
  )

  useEffect(() => {
    if (!hydrated) return
    const pending = exchanges.filter((e) => e.fromLink)
    if (!pending.length) return
    const ready = new Map(pending.map((e) => [e.id, begin(db, e.question, today, minutes, e.id)]))
    setExchanges((list) => list.map((e) => ready.get(e.id) ?? e))
  }, [hydrated, exchanges, db, today, minutes])

  useEffect(() => {
    if (exchanges.length) lastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [exchanges.length])

  const ask = (question: string) => {
    const q = question.trim()
    if (!q) return
    haptic('light')
    const ex = begin(db, q, today, minutes)
    setExchanges((list) => [...list, ex])
    setDraft('')
    inputRef.current?.blur()
  }

  const patch = (id: number, p: Partial<Exchange>) => setExchanges((list) => list.map((e) => (e.id === id ? { ...e, ...p } : e)))
  const setAdjust = (id: number, next: Exchange['adjust']) => patch(id, { adjust: next })

  const undoAdjust = (e: Exchange) => {
    const snap = snaps.current.get(e.id)
    if (!snap || !e.adjust) return
    undoPlan(snap)
    snaps.current.delete(e.id)
    setAdjust(e.id, { ...e.adjust, status: 'undone' })
  }

  /** Applies the plan (snapshot first) and offers "Desfazer" for every touched record. */
  const confirm = (e: Exchange) => {
    if (!e.adjust) return
    const snap = applyPlan(e.adjust.plan)
    snaps.current.set(e.id, snap)
    haptic('success')
    setAdjust(e.id, { ...e.adjust, status: 'applied' })
    toast(e.adjust.plan.doneTitle?.split('✓')[0].trim() ? `${e.adjust.plan.doneTitle.split('✓')[0].trim()} ✓` : 'Feito ✓', {
      action: { label: 'Desfazer', run: () => undoAdjust({ ...e, adjust: { ...e.adjust!, status: 'applied' } }) },
    })
    return visibleChanges(e.adjust.plan)[0]
  }

  const followUp = (plan: ChangePlan, kind: 'strategy' | 'week' | 'newStrategy') => {
    const primary = visibleChanges(plan)[0]
    if (kind === 'strategy' && primary) openSheet('fuel', { workoutId: primary.after.id })
    else if (kind === 'newStrategy') openSheet('nutritionStrategy', {})
    else navigate(`${ROUTES.body}?aba=semana`)
  }

  const openInsight = (i: Insight) => {
    if (i.ask) ask(i.ask)
    else if (i.action) runAction(i.action, navigate)
  }

  const asked = new Set(exchanges.map((e) => e.question))
  const moreQuestions = [...FOOD_EXAMPLES.slice(1, 3), ...EXAMPLE_QUESTIONS].filter((q) => !asked.has(q))

  return (
    <Page>
      <PageHeader
        back
        eyebrow="Chief of Staff"
        title={
          <>
            Oi, {db.profile.name || 'Marina'}.
            <br />
            Eu sou a Lumos ✨
          </>
        }
        subtitle="Me conta uma mudança no dia ou o que você comeu — ou pergunte sobre projetos, gastos, treinos e viagens."
      />

      <div className="inline-flex items-start gap-1.5 rounded-2xl bg-plum-soft text-plum px-3 py-1.5 text-[12.5px] leading-snug -mt-1">
        <Sparkles size={14} className="shrink-0 mt-[2px]" />
        <span>{GENERATIVE_PILL}</span>
      </div>

      <SectionTitle>Hoje eu reparei</SectionTitle>
      <div className="space-y-2">
        {insights.map((i, idx) => {
          const t = tone(i.tone)
          const pressable = !!(i.ask || i.action)
          return (
            <motion.button
              key={i.id}
              type="button"
              disabled={!pressable}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              onClick={() => openInsight(i)}
              className="card w-full flex items-center gap-3 px-3.5 py-3 text-left active:scale-[0.99] transition disabled:cursor-default"
            >
              <span className={cn('h-10 w-10 rounded-xl flex items-center justify-center text-[18px] shrink-0', t.soft)} aria-hidden>
                {i.emoji}
              </span>
              <span className="flex-1 text-[14.5px] leading-snug">{i.text}</span>
              {i.ask && <span className="text-[12px] text-accent font-medium shrink-0">perguntar</span>}
            </motion.button>
          )
        })}
      </div>

      {exchanges.length === 0 && (
        <>
          <SectionTitle>Mudar o dia</SectionTitle>
          <p className="text-[13.5px] text-muted leading-snug -mt-1 mb-2.5">{ADJUST_PILL} Nada muda sem você confirmar — e tudo tem Desfazer.</p>
          <div className="flex flex-wrap gap-2">
            {[...DAY_EXAMPLES, ...ADJUST_EXAMPLES.slice(1)].map((q) => (
              <Chip key={q} onClick={() => ask(q)} className="h-auto min-h-9 py-1.5 text-left">
                {q}
              </Chip>
            ))}
          </div>

          <SectionTitle>Comida</SectionTitle>
          <p className="text-[13.5px] text-muted leading-snug -mt-1 mb-2.5">Eu sigo o plano do seu nutri — registro, organizo e adapto sem compensar.</p>
          <div className="flex flex-wrap gap-2">
            {FOOD_EXAMPLES.map((q) => (
              <Chip key={q} onClick={() => ask(q)} className="h-auto min-h-9 py-1.5 text-left">
                {q}
              </Chip>
            ))}
          </div>

          <SectionTitle>Pergunte</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <Chip key={q} onClick={() => ask(q)} className="h-auto min-h-9 py-1.5 text-left">
                {q}
              </Chip>
            ))}
          </div>
        </>
      )}

      {answers.length > 0 && (
        <div className="mt-7 space-y-4" aria-live="polite">
          {answers.map((e, idx) => (
            <div key={e.id} ref={idx === answers.length - 1 ? lastRef : undefined} className="space-y-2.5 scroll-mt-4">
              <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink text-bg px-3.5 py-2.5 text-[15px] leading-snug">{e.question}</div>
              </motion.div>
              {e.adjust ? (
                <AdjustCard
                  db={db}
                  today={today}
                  plan={e.adjust.plan}
                  status={e.adjust.status}
                  onConfirm={() => confirm(e)}
                  onFineTune={() => {
                    const primary = confirm(e)
                    if (primary) openSheet('workout', { id: primary.after.id })
                  }}
                  onCancel={() => setAdjust(e.id, { ...e.adjust!, status: 'cancelled' })}
                  onChoose={(plan) => setAdjust(e.id, { plan, status: 'preview' })}
                  onFollowUp={(kind) => followUp(e.adjust!.plan, kind)}
                  onUndo={() => undoAdjust(e)}
                  onLink={(to) => navigate(to)}
                />
              ) : e.turn?.kind === 'foodLog' && e.food ? (
                <FoodLogCard
                  db={db}
                  date={today}
                  nowMinutes={minutes}
                  intent={e.turn.intent}
                  state={e.food}
                  onLog={(foods, savable) => patch(e.id, { food: logNow(foods, savable, e.turn?.kind === 'foodLog' ? e.turn.intent.at : undefined) })}
                  onUndo={() => {
                    e.food?.undo?.()
                    patch(e.id, { food: { status: 'undone' } })
                    toast('Registro desfeito')
                  }}
                />
              ) : e.turn?.kind === 'food' && e.reply ? (
                <FoodAnswerCard
                  reply={e.reply}
                  skipUndone={e.skipUndone}
                  onUndoSkip={
                    e.skipUndo
                      ? () => {
                          e.skipUndo?.()
                          patch(e.id, { skipUndone: true, skipUndo: undefined })
                        }
                      : undefined
                  }
                />
              ) : e.turn?.kind === 'mealprep' ? (
                <MealPrepCard db={db} today={today} nowMinutes={minutes} intent={e.turn.intent} onOpen={(to) => navigate(to)} />
              ) : (
                e.answer && <AnswerCard answer={e.answer} onAsk={ask} />
              )}
            </div>
          ))}
          {moreQuestions.length > 0 && (
            <div className="pt-1">
              <div className="eyebrow px-1 mb-2">Outras perguntas</div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                {moreQuestions.map((q) => (
                  <Chip key={q} onClick={() => ask(q)}>
                    {q}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Room for the composer above the nav. */}
      <div className="h-20" />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(draft)
        }}
        className="fixed left-0 right-0 z-30 bg-bg/90 backdrop-blur-xl border-t border-line/60"
        style={{ bottom: kb > 0 ? kb : 'calc(env(safe-area-inset-bottom) + 60px)' }}
      >
        {/* Leaves room for the global + button on the right when the keyboard is closed. */}
        <div className={cn('mx-auto max-w-[640px] pl-4 py-3', kb > 0 ? 'pr-4' : 'pr-[84px]')}>
          <div className="relative">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              enterKeyHint="send"
              autoComplete="off"
              aria-label="Fale com a Lumos"
              placeholder="Ex.: amanhã cancelei meu inglês"
              className="input h-12 pr-12 rounded-full bg-surface border-line placeholder:text-[14px]"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!draft.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-ink text-bg flex items-center justify-center transition active:scale-95 disabled:opacity-30"
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
      </form>
    </Page>
  )
}
