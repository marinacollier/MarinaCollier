/**
 * LumosInline — the Lumos conversation as a component, usable on Home and on /lumos.
 *
 *   <LumosInline />                         composer ("fala comigo") + suggestions + the conversation
 *   <LumosInline initial="faz minha feira" /> asks that sentence once (and again whenever it changes)
 *   <LumosInline composer={false} />        only the conversation (a screen with its own composer
 *                                            can call `sendToLumos(text)`)
 *
 * The conversation is one session store (./conversation.ts), so Home and /lumos show the same talk.
 * Voice uses the browser's speech recognition when it exists (otherwise the button doesn't show);
 * files go through `normalizeCapture`, which says honestly what Lumos can't read yet.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUp, Mic, Paperclip } from 'lucide-react'
import { Chip } from '@/components/ui'
import { homeSuggestions, normalizeCapture, type Now } from '@/data/intel'
import { useDB, useStore } from '@/data/store'
import { nextTrip } from '@/data/selectors'
import type { DB } from '@/data/types'
import { useNow } from '@/hooks/useToday'
import { diffDays, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import { openSheet } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { AnswerCard } from './AnswerCard'
import { AdjustCard } from './adjust/AdjustCard'
import { visibleChanges } from './adjust/planner'
import type { ChangePlan } from './adjust/types'
import { attentionFor, intelReady } from './act/intel'
import { askLumos } from './chief'
import {
  ask,
  canUndo,
  cancelReply,
  chooseAdjust,
  confirmAdjust,
  confirmReply,
  logFood,
  resolveWaiting,
  runOption,
  say,
  setAdjust,
  setDraft,
  undoAdjust,
  undoFood,
  undoReply,
  undoSkip,
  useConversation,
  type Exchange,
} from './conversation'
import { FoodAnswerCard, FoodLogCard } from './food/FoodCards'
import { MealPrepCard } from './food/MealPrepCard'
import { ReplyCard } from './ReplyCard'

/** Send a sentence to the shared Lumos conversation from anywhere (Home suggestion chips…). */
export function sendToLumos(text: string): void {
  ask(text)
}

// ─── Context: placeholder + suggestions ─────────────────────────────────────

export function contextPlaceholder(now: Now): string {
  const h = now.minutes / 60
  const wd = weekday(now.date)
  if (h < 11) return 'o que eu tenho hoje?'
  if (wd >= 1 && wd <= 5 && h < 18) return 'o que precisa de mim?'
  if (h >= 20) return 'me ajuda a organizar amanhã'
  return 'o que mudou?'
}

/** Max 3, from the intelligence layer; a small local version while it isn't there. Never generic. */
export function contextSuggestions(db: DB, now: Now): string[] {
  if (intelReady(db, now)) return homeSuggestions(db, now).slice(0, 3)
  const out: string[] = []
  const h = now.minutes / 60
  const wd = weekday(now.date)
  if (attentionFor(db, now).length) out.push('o que realmente precisa de mim?')
  if ((wd === 0 && h >= 16) || (wd === 1 && h < 12) || wd === 6) out.push('monta minha semana')
  if (h < 11) out.push('o que eu tenho hoje?')
  else if (wd >= 1 && wd <= 5 && h < 18) out.push('me atualiza de trabalho')
  else out.push('o que eu tenho amanhã?')
  const trip = nextTrip(db, now.date)
  if (trip?.startDate && diffDays(now.date, trip.startDate) <= 30 && diffDays(now.date, trip.startDate) >= 0) out.push('o que falta pra viagem?')
  if (wd === 0 || wd === 6 || wd === 5) out.push('faz minha feira')
  return [...new Set(out)].slice(0, 3)
}

// ─── Voice (only when the browser has it) ───────────────────────────────────

interface Recognition {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

function speechCtor(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

// ─── Composer ───────────────────────────────────────────────────────────────

function Composer({ variant, placeholder }: { variant: 'home' | 'page'; placeholder: string }) {
  const draft = useConversation((s) => s.draft)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [listening, setListening] = useState(false)
  const Speech = useMemo(speechCtor, [])
  const recRef = useRef<Recognition | null>(null)

  useEffect(() => {
    if (draft) inputRef.current?.focus()
  }, [draft])

  const send = () => {
    if (!draft.trim()) return
    ask(draft)
    inputRef.current?.blur()
  }

  const listen = () => {
    if (!Speech) return
    if (listening) return recRef.current?.stop()
    const rec = new Speech()
    rec.lang = 'pt-BR'
    rec.interimResults = false
    rec.onresult = (e) => setDraft(Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').trim())
    rec.onend = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    const kind = file.type.startsWith('image/') ? 'image' : 'file'
    const c = normalizeCapture({ kind, file, name: file.name })
    say(`📎 ${file.name}`, { area: 'arquivo', text: c.note ?? 'Recebi o arquivo.', sub: c.supported ? undefined : 'Por enquanto: texto (e voz, quando o navegador deixa).' })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      className={cn('relative rounded-[26px] border border-line bg-surface transition-shadow focus-within:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]', variant === 'home' ? 'p-3.5 pb-2.5' : 'p-2 pl-3.5')}
    >
      <textarea
        ref={inputRef}
        value={draft}
        rows={variant === 'home' ? 2 : 1}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
        enterKeyHint="send"
        autoComplete="off"
        aria-label="Fale com a Lumos"
        placeholder={placeholder}
        className={cn('w-full resize-none bg-transparent outline-none text-[16px] leading-snug placeholder:text-muted', variant === 'home' ? 'min-h-[48px] font-display text-[18px] placeholder:font-display' : 'min-h-[36px] py-1.5 pr-24')}
      />
      <div className={cn('flex items-center gap-1', variant === 'home' ? 'justify-end mt-1' : 'absolute right-2 bottom-2')}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo ou print" className="h-10 w-10 rounded-full text-muted flex items-center justify-center active:bg-surface-2">
          <Paperclip size={18} />
        </button>
        {Speech && (
          <button type="button" onClick={listen} aria-label={listening ? 'Parar de ouvir' : 'Falar'} aria-pressed={listening} className={cn('h-10 w-10 rounded-full flex items-center justify-center active:bg-surface-2', listening ? 'text-accent bg-accent-soft' : 'text-muted')}>
            <Mic size={18} />
          </button>
        )}
        <button type="submit" aria-label="Enviar" disabled={!draft.trim()} className="h-10 w-10 rounded-full bg-ink text-bg flex items-center justify-center transition active:scale-95 disabled:opacity-25">
          <ArrowUp size={18} />
        </button>
      </div>
    </form>
  )
}

// ─── One exchange ───────────────────────────────────────────────────────────

function ExchangeView({ e, db, today, minutes }: { e: Exchange; db: DB; today: string; minutes: number }) {
  const navigate = useNavigate()
  const answer = useMemo(() => (e.turn?.kind === 'answer' ? askLumos(db, e.question, today, minutes) : undefined), [db, e.turn?.kind, e.question, today, minutes])
  const followUp = (plan: ChangePlan, kind: 'strategy' | 'week' | 'newStrategy') => {
    const primary = visibleChanges(plan)[0]
    if (kind === 'strategy' && primary) openSheet('fuel', { workoutId: primary.after.id })
    else if (kind === 'newStrategy') openSheet('nutritionStrategy', {})
    else navigate(`${ROUTES.body}?aba=semana`)
  }
  return (
    <div className="space-y-2.5 scroll-mt-4">
      <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink text-bg px-3.5 py-2.5 text-[15px] leading-snug">{e.question}</div>
      </motion.div>
      {e.waiting ? (
        <div className="card p-4 text-[14px] text-muted">Só um instante…</div>
      ) : e.lumos ? (
        <ReplyCard
          reply={e.lumos.reply}
          status={e.lumos.status}
          canUndo={canUndo(e.id)}
          onConfirm={() => confirmReply(e.id)}
          onCancel={() => cancelReply(e.id)}
          onUndo={() => undoReply(e.id)}
          onOption={runOption}
          onLink={(to) => navigate(to)}
        />
      ) : e.adjust ? (
        <AdjustCard
          db={db}
          today={today}
          plan={e.adjust.plan}
          status={e.adjust.status}
          onConfirm={() => confirmAdjust(e.id)}
          onFineTune={() => {
            if (e.adjust!.status === 'preview') confirmAdjust(e.id)
            const primary = visibleChanges(e.adjust!.plan)[0]
            if (primary) openSheet('workout', { id: primary.after.id })
          }}
          onCancel={() => setAdjust(e.id, { ...e.adjust!, status: 'cancelled' })}
          onChoose={(plan) => chooseAdjust(e.id, plan)}
          onFollowUp={(kind) => followUp(e.adjust!.plan, kind)}
          onUndo={() => undoAdjust(e.id)}
          onLink={(to) => navigate(to)}
        />
      ) : e.turn?.kind === 'foodLog' && e.food ? (
        <FoodLogCard db={db} date={today} nowMinutes={minutes} intent={e.turn.intent} state={e.food} onLog={(foods, savable) => logFood(e.id, foods, savable)} onUndo={() => undoFood(e.id)} />
      ) : e.turn?.kind === 'food' && e.foodReply ? (
        <FoodAnswerCard reply={e.foodReply} skipUndone={e.skipUndone} onUndoSkip={canUndo(e.id) ? () => undoSkip(e.id) : undefined} />
      ) : e.turn?.kind === 'mealprep' ? (
        <MealPrepCard db={db} today={today} nowMinutes={minutes} intent={e.turn.intent} onOpen={(to) => navigate(to)} />
      ) : (
        answer && <AnswerCard answer={answer} onAsk={(q) => ask(q)} />
      )}
    </div>
  )
}

// ─── The component ──────────────────────────────────────────────────────────

export interface LumosInlineProps {
  /** A sentence to ask once on mount (and whenever it changes). */
  initial?: string
  /** Show the composer (default true). */
  composer?: boolean
  placeholder?: string
  /** Chips under the composer while the conversation is empty (default: from the context, max 3). */
  suggestions?: string[]
  /** 'home' = composer on top, last exchanges below · 'page' = full conversation, composer fixed at the bottom. */
  variant?: 'home' | 'page'
  /** Home: how many recent exchanges to show (default 2). */
  limit?: number
}

export default function LumosInline({ initial, composer = true, placeholder, suggestions, variant = 'home', limit = 2 }: LumosInlineProps) {
  const db = useDB()
  const { today, minutes } = useNow()
  const navigate = useNavigate()
  const hydrated = useStore((s) => s.hydrated)
  const exchanges = useConversation((s) => s.exchanges)
  const asked = useRef<string | undefined>(undefined)
  const lastRef = useRef<HTMLDivElement>(null)
  const now: Now = { date: today, minutes }

  useEffect(() => {
    const q = initial?.trim()
    if (!q || asked.current === q) return
    asked.current = q
    ask(q)
  }, [initial])

  useEffect(() => {
    if (hydrated) resolveWaiting()
  }, [hydrated, exchanges.length])

  useEffect(() => {
    if (variant === 'page' && exchanges.length) lastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [exchanges.length, variant])

  const chips = useMemo(() => suggestions ?? contextSuggestions(db, { date: today, minutes }), [suggestions, db, today, minutes])
  const shown = variant === 'home' ? exchanges.slice(-limit) : exchanges
  const hint = placeholder ?? `fala comigo — “${contextPlaceholder(now)}”`

  const conversation = shown.length > 0 && (
    <div className="space-y-4" aria-live="polite">
      {variant === 'home' && exchanges.length > shown.length && (
        <button type="button" onClick={() => navigate(ROUTES.assistant)} className="text-[13px] text-muted h-9 px-0.5">
          Ver a conversa toda ({exchanges.length})
        </button>
      )}
      {shown.map((e, i) => (
        <div key={e.id} ref={i === shown.length - 1 ? lastRef : undefined}>
          <ExchangeView e={e} db={db} today={today} minutes={minutes} />
        </div>
      ))}
    </div>
  )

  const chipRow = chips.length > 0 && (variant === 'home' || !exchanges.length) && (
    <div className="flex flex-wrap gap-2">
      {chips.map((q) => (
        <Chip key={q} onClick={() => ask(q)} className="h-auto min-h-9 py-1.5 text-left">
          {q}
        </Chip>
      ))}
    </div>
  )

  if (variant === 'page') {
    return (
      <div className="space-y-4">
        {chipRow}
        {conversation}
        {composer && (
          <>
            <div className="h-24" />
            <div className="fixed left-0 right-0 z-30 bg-bg/90 backdrop-blur-xl border-t border-line/60" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 60px)' }}>
              <div className="mx-auto max-w-[640px] px-4 py-2.5">
                <Composer variant="page" placeholder={hint} />
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {composer && <Composer variant="home" placeholder={hint} />}
      {!exchanges.length && chipRow}
      {conversation}
    </div>
  )
}
