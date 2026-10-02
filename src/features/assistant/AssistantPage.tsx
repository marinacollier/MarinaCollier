import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUp, Sparkles } from 'lucide-react'
import { Chip, Page, PageHeader, SectionTitle, tone } from '@/components/ui'
import { useDB } from '@/data/store'
import { useNow } from '@/hooks/useToday'
import { useKeyboardInset } from '@/hooks/useKeyboardInset'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { runAction } from '@/features/search/actions'
import { AnswerCard } from './AnswerCard'
import { askMari, EXAMPLE_QUESTIONS } from './chief'
import { buildInsights, type Insight } from './insights'
import { GENERATIVE_PILL } from './llm'

interface Exchange {
  id: number
  question: string
}

let nextId = 1

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
    return q ? [{ id: nextId++, question: q }] : []
  })
  const [draft, setDraft] = useState('')
  const lastRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (params.get('q')) setParams({}, { replace: true })
  }, [params, setParams])

  const insights = useMemo(() => buildInsights(db, today, minutes), [db, today, minutes])
  const answers = useMemo(() => exchanges.map((e) => ({ ...e, answer: askMari(db, e.question, today, minutes) })), [db, exchanges, today, minutes])

  useEffect(() => {
    if (exchanges.length) lastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [exchanges.length])

  const ask = (question: string) => {
    const q = question.trim()
    if (!q) return
    haptic('light')
    setExchanges((list) => [...list, { id: nextId++, question: q }])
    setDraft('')
    inputRef.current?.blur()
  }

  const openInsight = (i: Insight) => {
    if (i.ask) ask(i.ask)
    else if (i.action) runAction(i.action, navigate)
  }

  const asked = new Set(exchanges.map((e) => e.question))
  const moreQuestions = EXAMPLE_QUESTIONS.filter((q) => !asked.has(q))

  return (
    <Page>
      <PageHeader back eyebrow="Chief of Staff" title={
          <>
            Oi, {db.profile.name || 'Marina'}.
            <br />
            Eu sou a Mari ✨
          </>
        } subtitle="Pergunte sobre seu dia, projetos, gastos, treinos, viagens e livros." />

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
              <AnswerCard answer={e.answer} onAsk={ask} />
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
              aria-label="Pergunte para a Mari"
              placeholder="Pergunte para a Mari…"
              className="input h-12 pr-12 rounded-full bg-surface border-line"
            />
            <button
              type="submit"
              aria-label="Enviar pergunta"
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
