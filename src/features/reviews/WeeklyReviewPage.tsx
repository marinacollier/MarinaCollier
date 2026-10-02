import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Sparkles, X } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { DateKey, WeeklyReview } from '@/data/types'
import { Button, Card, Chip, IconButton, Page, PageHeader, SectionTitle, TextArea, TextInput } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { addDays, formatShortDate, startOfWeek } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { formatBRLShort } from '@/lib/money'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'
import { cn } from '@/lib/cn'
import { weekLabel } from '@/features/goals/logic'
import {
  findWeeklyReview,
  goalsForPriorities,
  nextMonday,
  prioritySuggestions,
  QUESTIONS,
  reviewEventOfWeek,
  reviewWeekFor,
  weekData,
  weeklyHints,
  type PrioritySuggestion,
  type QuestionKey,
  type WeekData,
} from './weekly'
import { plural } from './shared'
import { AgendaHint } from './AgendaHint'

type Answers = WeeklyReview['answers']

const SUMMARY = QUESTIONS.length
const PRIORITIES = SUMMARY + 1
const DONE = SUMMARY + 2
/** Steps that show progress dots: questions + summary + priorities. */
const DOT_COUNT = QUESTIONS.length + 2

function upsertReview(weekStart: DateKey, patch: Partial<WeeklyReview>) {
  const ex = findWeeklyReview(getDB().weeklyReviews, weekStart)
  if (ex) actions.update('weeklyReviews', ex.id, patch)
  else actions.create('weeklyReviews', { weekStart, answers: {}, nextPriorities: [], ...patch })
}

export default function WeeklyReviewPage() {
  const db = useDB()
  const today = useToday()
  const [weekStart, setWeekStart] = useState<DateKey>(() => reviewWeekFor(today))
  /** -1 = intro. */
  const [step, setStep] = useState(-1)
  const [dir, setDir] = useState(1)
  const [answers, setAnswers] = useState<Answers>({})
  const [picked, setPicked] = useState<PrioritySuggestion[]>([])

  const data = useMemo(() => weekData(db, weekStart), [db, weekStart])
  const hints = useMemo(() => weeklyHints(data), [data])
  const existing = findWeeklyReview(db.weeklyReviews, weekStart)

  const start = (ws: DateKey = weekStart) => {
    const ex = findWeeklyReview(getDB().weeklyReviews, ws)
    setWeekStart(ws)
    setAnswers(ex?.answers ?? {})
    setPicked((ex?.nextPriorities ?? []).map((title) => ({ title, category: 'pessoal' as const })))
    setDir(1)
    setStep(0)
  }

  const go = (to: number) => {
    if (step >= 0 && step < SUMMARY) upsertReview(weekStart, { answers })
    setDir(to > step ? 1 : -1)
    setStep(to)
    window.scrollTo({ top: 0 })
  }

  const finish = () => {
    const toCreate = goalsForPriorities(getDB().goals, weekStart, picked)
    let order = nextOrder(getDB().goals)
    for (const g of toCreate) actions.create('goals', { ...g, order: order++ })
    upsertReview(weekStart, { answers, nextPriorities: picked.map((p) => p.title), completedAt: nowISO() })
    haptic('success')
    toast('Semana fechada 🌙', { tone: 'win' })
    go(DONE)
  }

  if (step === -1)
    return (
      <Intro
        weekStart={weekStart}
        setWeekStart={setWeekStart}
        today={today}
        data={data}
        existing={existing}
        reviews={db.weeklyReviews}
        onStart={start}
      />
    )

  return (
    <Page>
      <div className="pt-2 flex items-center justify-between min-h-11 -mx-1.5">
        <IconButton
          label={step === 0 ? 'Sair da revisão' : 'Voltar'}
          onClick={() => (step === 0 || step === DONE ? setStep(-1) : go(step - 1))}
        >
          {step === 0 || step === DONE ? <X size={20} /> : <ChevronLeft size={22} />}
        </IconButton>
        {step < DONE && <Dots current={step} total={DOT_COUNT} />}
        {step < SUMMARY ? (
          <button className="h-11 px-3 text-[14px] text-muted" onClick={() => go(step + 1)}>
            pular
          </button>
        ) : (
          <span className="w-11" />
        )}
      </div>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          initial={{ opacity: 0, x: dir * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -24 }}
          transition={{ duration: 0.2 }}
        >
          {step < SUMMARY && (
            <QuestionStep
              index={step}
              qKey={QUESTIONS[step].key}
              value={answers[QUESTIONS[step].key] ?? ''}
              hint={hints[QUESTIONS[step].key]}
              onChange={(v) => setAnswers((a) => ({ ...a, [QUESTIONS[step].key]: v }))}
              onNext={() => go(step + 1)}
              onBack={step > 0 ? () => go(step - 1) : undefined}
            />
          )}
          {step === SUMMARY && <SummaryStep data={data} onNext={() => go(PRIORITIES)} />}
          {step === PRIORITIES && (
            <PrioritiesStep data={data} weekStart={weekStart} picked={picked} setPicked={setPicked} onFinish={finish} />
          )}
          {step === DONE && <DoneStep weekStart={weekStart} picked={picked} onIntro={() => setStep(-1)} />}
        </motion.div>
      </AnimatePresence>
    </Page>
  )
}

// ─── Intro ──────────────────────────────────────────────────────────────────

function Intro({
  weekStart,
  setWeekStart,
  today,
  data,
  existing,
  reviews,
  onStart,
}: {
  weekStart: DateKey
  setWeekStart: (k: DateKey) => void
  today: DateKey
  data: WeekData
  existing?: WeeklyReview
  reviews: WeeklyReview[]
  onStart: (ws?: DateKey) => void
}) {
  const past = useMemo(
    () => [...reviews].filter((r) => r.completedAt).sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [reviews],
  )
  const canGoForward = weekStart < startOfWeek(today)
  const db = useDB()
  const ceo = useMemo(() => reviewEventOfWeek(db, weekStart), [db, weekStart])
  return (
    <Page>
      <PageHeader
        back
        title="Revisão da semana"
        subtitle="Uns 5 minutos, uma pergunta por vez. Pode pular qualquer uma."
      />

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <IconButton
            label="Semana anterior"
            size="sm"
            variant="soft"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            <ChevronLeft size={18} />
          </IconButton>
          <div className="flex-1 text-center">
            <div className="eyebrow">{existing?.completedAt ? 'Semana revisada ✓' : 'Semana'}</div>
            <div className="font-display text-[24px] leading-tight mt-0.5">{weekLabel(weekStart)}</div>
          </div>
          <IconButton
            label="Próxima semana"
            size="sm"
            variant="soft"
            disabled={!canGoForward}
            className="disabled:opacity-30"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-5 text-center">
          <Glance value={data.tasksDone} label={data.tasksDone === 1 ? 'tarefa feita' : 'tarefas feitas'} />
          <Glance value={data.workouts.done} label={data.workouts.done === 1 ? 'treino' : 'treinos'} />
          <Glance value={data.goals.done} label={`de ${data.goals.total} metas`} />
        </div>

        <Button variant="accent" size="lg" className="mt-5" onClick={() => onStart()}>
          {existing?.completedAt
            ? 'Rever respostas'
            : Object.keys(existing?.answers ?? {}).length
              ? 'Continuar de onde parei'
              : 'Começar'}
        </Button>
      </Card>

      {ceo && <AgendaHint emoji="📋" when={`${formatShortDate(ceo.date)}${ceo.event.startTime ? ` · ${ceo.event.startTime}` : ''}`} title={ceo.event.title} eventId={ceo.event.id} />}

      <SectionTitle>Revisões anteriores</SectionTitle>
      {past.length === 0 ? (
        <p className="px-1 text-[14px] text-muted">A primeira fica guardada aqui. Sem pressa ✨</p>
      ) : (
        <div className="space-y-2">
          {past.map((r) => (
            <PastReview key={r.id} review={r} onEdit={() => onStart(r.weekStart)} />
          ))}
        </div>
      )}
    </Page>
  )
}

function Glance({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 py-3 px-1">
      <div className="font-display text-[24px] leading-none">{value}</div>
      <div className="text-[12px] text-muted mt-1 leading-tight">{label}</div>
    </div>
  )
}

function PastReview({ review, onEdit }: { review: WeeklyReview; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const answered = QUESTIONS.filter((q) => review.answers[q.key]?.trim())
  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center gap-3 min-h-14 px-4 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="font-display text-[17px]">{weekLabel(review.weekStart)}</div>
          <div className="text-[12.5px] text-muted">
            {plural(answered.length, 'resposta', 'respostas')}
            {review.nextPriorities.length
              ? ` · ${plural(review.nextPriorities.length, 'prioridade', 'prioridades')}`
              : ''}
          </div>
        </div>
        <ChevronDown size={18} className={cn('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-line/70 pt-3">
              {answered.map((q) => (
                <div key={q.key}>
                  <div className="text-[12.5px] text-muted">{q.question}</div>
                  <div className="text-[14.5px] whitespace-pre-wrap">{review.answers[q.key]}</div>
                </div>
              ))}
              {review.nextPriorities.length > 0 && (
                <div>
                  <div className="text-[12.5px] text-muted">Prioridades da semana seguinte</div>
                  <ol className="text-[14.5px] list-decimal pl-5">
                    {review.nextPriorities.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                </div>
              )}
              <Button variant="soft" size="sm" onClick={onEdit}>
                Editar essa revisão
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Steps ──────────────────────────────────────────────────────────────────

function Dots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Passo ${current + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            i === current ? 'w-5 bg-accent' : i < current ? 'w-1.5 bg-ink-2/60' : 'w-1.5 bg-line',
          )}
        />
      ))}
    </div>
  )
}

function QuestionStep({
  index,
  qKey,
  value,
  hint,
  onChange,
  onNext,
  onBack,
}: {
  index: number
  qKey: QuestionKey
  value: string
  hint?: string
  onChange: (v: string) => void
  onNext: () => void
  onBack?: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), 220)
    return () => clearTimeout(t)
  }, [qKey])
  const q = QUESTIONS[index]
  return (
    <div className="pt-6">
      <div className="eyebrow">
        Pergunta {index + 1} de {QUESTIONS.length}
      </div>
      <h1 className="font-display text-[30px] leading-[1.12] tracking-tight mt-2">{q.question}</h1>
      {hint && (
        <div className="mt-4 flex gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-[14px] text-ink-2">
          <Sparkles size={16} className="text-sand shrink-0 mt-0.5" />
          <span>{hint}</span>
        </div>
      )}
      <TextArea
        ref={ref}
        rows={6}
        className="mt-4 bg-surface"
        placeholder={q.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={q.question}
      />
      <div className="flex items-center gap-3 mt-4">
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            voltar
          </Button>
        )}
        <Button variant="primary" size="lg" className="flex-1" onClick={onNext}>
          {value.trim() ? 'Próxima' : 'Pular por agora'}
        </Button>
      </div>
    </div>
  )
}

function SummaryStep({ data, onNext }: { data: WeekData; onNext: () => void }) {
  const tiles: { emoji: string; label: string; value: ReactNode; detail?: ReactNode }[] = [
    { emoji: '📅', label: 'Agenda', value: plural(data.events, 'compromisso', 'compromissos') },
    {
      emoji: '✓',
      label: 'Tarefas',
      value: `${data.tasksDone} concluídas`,
      detail: data.openTasks.length ? `${data.openTasks.length} seguem abertas` : undefined,
    },
    {
      emoji: '🏃‍♀️',
      label: 'Treinos',
      value: data.workouts.planned
        ? `${data.workouts.done} de ${data.workouts.planned}`
        : plural(data.workouts.done, 'treino', 'treinos'),
      detail: data.workouts.byModality.map((m) => `${m.emoji} ${m.count}`).join('  ') || undefined,
    },
    {
      emoji: '💸',
      label: 'Dinheiro',
      value: data.money.count ? formatBRLShort(data.money.total) : 'nada anotado',
      detail: data.money.top.map((c) => `${c.emoji} ${c.name}`).join(' · ') || undefined,
    },
    {
      emoji: '💼',
      label: 'Trabalho',
      value: plural(data.wins.length, 'win', 'wins'),
      detail: data.projects.length
        ? data.projects
            .map((p) => p.project.name)
            .slice(0, 3)
            .join(', ')
        : undefined,
    },
    {
      emoji: '📚',
      label: 'Estudos',
      value:
        data.studiesFinished.length + data.booksFinished.length
          ? `${data.studiesFinished.length + data.booksFinished.length} finalizados`
          : data.studiesMoving.length
            ? `${data.studiesMoving.length} em andamento`
            : 'sem registro',
      detail:
        [...data.booksFinished.map((b) => `📖 ${b.title}`), ...data.studiesFinished.map((s) => s.title)]
          .slice(0, 2)
          .join(' · ') || undefined,
    },
    {
      emoji: '🏡',
      label: 'Vida',
      value: plural(data.life.done, 'cuidado feito', 'cuidados feitos'),
      detail: 'Luna + vida real',
    },
    {
      emoji: '🎯',
      label: 'Metas',
      value: `${data.goals.done} de ${data.goals.total}`,
      detail: data.goals.total
        ? data.goals.done === data.goals.total
          ? 'todas feitas ✨'
          : 'um passo de cada vez'
        : undefined,
    },
  ]
  return (
    <div className="pt-6">
      <div className="eyebrow">Sua semana em um olhar</div>
      <h1 className="font-display text-[30px] leading-[1.12] tracking-tight mt-2">Olha tudo que coube aqui.</h1>
      <div className="grid grid-cols-2 gap-2.5 mt-5">
        {tiles.map((t, i) => (
          <motion.div
            key={t.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="card p-3.5 min-w-0"
          >
            <div className="flex items-center gap-1.5">
              <span aria-hidden>{t.emoji}</span>
              <span className="eyebrow">{t.label}</span>
            </div>
            <div className="font-display text-[17px] leading-tight mt-1.5">{t.value}</div>
            {t.detail && <div className="text-[12.5px] text-muted mt-1 line-clamp-2">{t.detail}</div>}
          </motion.div>
        ))}
      </div>
      <Button variant="primary" size="lg" className="mt-5" onClick={onNext}>
        Escolher a próxima semana
      </Button>
    </div>
  )
}

function PrioritiesStep({
  data,
  weekStart,
  picked,
  setPicked,
  onFinish,
}: {
  data: WeekData
  weekStart: DateKey
  picked: PrioritySuggestion[]
  setPicked: (p: PrioritySuggestion[]) => void
  onFinish: () => void
}) {
  const suggestions = useMemo(() => prioritySuggestions(data), [data])
  const [text, setText] = useState('')
  const full = picked.length >= 3
  const isPicked = (t: string) => picked.some((p) => normalize(p.title) === normalize(t))

  const toggle = (s: PrioritySuggestion) => {
    if (isPicked(s.title)) setPicked(picked.filter((p) => normalize(p.title) !== normalize(s.title)))
    else if (!full) {
      haptic('light')
      setPicked([...picked, s])
    } else toast('Já tem 3 — tire uma pra trocar')
  }
  const addText = () => {
    const t = text.trim()
    if (!t || isPicked(t)) return setText('')
    if (full) return toast('Já tem 3 — tire uma pra trocar')
    setPicked([...picked, { title: t, category: 'pessoal' }])
    setText('')
    haptic('light')
  }

  return (
    <div className="pt-6">
      <div className="eyebrow">Semana de {formatShortDate(nextMonday(weekStart))}</div>
      <h1 className="font-display text-[30px] leading-[1.12] tracking-tight mt-2">
        Escolha suas 3 prioridades da próxima semana
      </h1>
      <p className="text-[14px] text-muted mt-2">Elas viram suas 3 grandes metas da semana. O resto pode esperar.</p>

      <div className="mt-5 space-y-2">
        {[0, 1, 2].map((i) => {
          const p = picked[i]
          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-3 min-h-13 rounded-2xl px-4 py-2.5',
                p ? 'card' : 'border border-dashed border-line',
              )}
            >
              <span className={cn('font-display text-[22px] w-5 text-center', p ? 'text-sand' : 'text-muted/50')}>
                {i + 1}
              </span>
              <span className={cn('flex-1 min-w-0 text-[15px] leading-snug', !p && 'text-muted/70')}>
                {p ? p.title : 'escolha abaixo ou escreva'}
              </span>
              {p && (
                <IconButton
                  label={`Tirar ${p.title}`}
                  size="sm"
                  onClick={() => setPicked(picked.filter((x) => x !== p))}
                >
                  <X size={16} />
                </IconButton>
              )}
            </div>
          )
        })}
      </div>

      <form
        className="flex gap-2 mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          addText()
        }}
      >
        <TextInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escrever uma prioridade…"
          aria-label="Nova prioridade"
        />
        <IconButton
          label="Adicionar prioridade"
          variant="soft"
          type="submit"
          disabled={!text.trim()}
          className="disabled:opacity-40 h-12 w-12"
        >
          <Plus size={18} />
        </IconButton>
      </form>

      {suggestions.length > 0 && (
        <>
          <div className="eyebrow mt-5 mb-2 px-0.5">Do que ficou em aberto</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Chip
                key={s.title}
                selected={isPicked(s.title)}
                onClick={() => toggle(s)}
                className="h-auto min-h-9 py-1.5 text-left"
              >
                {s.title}
              </Chip>
            ))}
          </div>
        </>
      )}

      <Button variant="accent" size="lg" className="mt-6" onClick={onFinish}>
        {picked.length ? 'Fechar a semana' : 'Fechar sem prioridades'}
      </Button>
    </div>
  )
}

function DoneStep({
  weekStart,
  picked,
  onIntro,
}: {
  weekStart: DateKey
  picked: PrioritySuggestion[]
  onIntro: () => void
}) {
  const nav = useNavigate()
  return (
    <div className="pt-16 text-center flex flex-col items-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4 }}
        className="text-5xl"
      >
        🌙
      </motion.div>
      <h1 className="font-display text-[30px] leading-tight mt-4">Semana fechada.</h1>
      <p className="text-[15px] text-muted mt-2 max-w-[30ch]">
        {picked.length
          ? `Suas ${picked.length === 1 ? 'prioridade já está' : `${picked.length} prioridades já estão`} em Metas, na semana de ${formatShortDate(nextMonday(weekStart))}.`
          : 'Obrigada por parar um pouquinho pra olhar pra ela.'}
      </p>
      <div className="flex flex-col gap-2 mt-8 w-full max-w-[320px]">
        {picked.length > 0 && (
          <Button variant="primary" size="lg" onClick={() => nav(ROUTES.goals)}>
            Ver minhas metas
          </Button>
        )}
        <Button variant={picked.length ? 'soft' : 'primary'} size="lg" onClick={() => nav(ROUTES.weekPlanner)}>
          🧭 Montar minha semana
        </Button>
        <Button variant="ghost" onClick={onIntro}>
          Voltar pra revisão
        </Button>
      </div>
    </div>
  )
}
