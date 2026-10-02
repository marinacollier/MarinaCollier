import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Brain, ChevronRight, Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { actions, useDB } from '@/data/store'
import type { DateKey, DB, ModuleId, Tone } from '@/data/types'
import {
  checkinFor,
  daysUntil,
  modalityOf,
  nextTrip,
  readingNow,
  spendSummary,
  studyingNow,
  workoutsOn,
} from '@/data/selectors'
import { Checkbox, Page, PageHeader, SectionTitle, TONE } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatBRLShort } from '@/lib/money'
import { formatLongDate, formatShortDate, formatMonth, weekday, WEEKDAY_LONG } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { pluralize } from '@/lib/text'
import { cn } from '@/lib/cn'
import {
  creativeThisWeek,
  hubOrder,
  isLunaOutOfRoutine,
  isModuleVisible,
  isPlanningDay,
  isReviewTime,
  lifeAdminCounts,
  lunaOf,
  lunaPendingToday,
  lunaTodaySplit,
  vidaPriorities,
  weekGoalsLabel,
  weekGoalsSummary,
  weekPlanConfirmed,
  type CreativeSlot,
  type HubBlock,
} from './selectors'

const enter = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.035 * i, duration: 0.32, ease: 'easeOut' as const },
})

export default function LifePage() {
  const db = useDB()
  const today = useToday()
  const nav = useNavigate()
  const show = (id: ModuleId) => isModuleVisible(db.profile, id)
  const h = useMemo(() => hubData(db, today), [db, today])
  const reviewTime = isReviewTime(today)
  const order = hubOrder(today)

  const blocks: Record<HubBlock, () => ReactNode> = {
    capture: () => (
      <>
        <button
          type="button"
          onClick={() => openSheet('brainDump')}
          className="w-full flex items-center gap-3 rounded-[22px] bg-ink text-bg px-4 py-4 text-left active:scale-[0.99] transition shadow-card"
        >
          <span className="h-11 w-11 rounded-full bg-bg/10 flex items-center justify-center shrink-0">
            <Brain size={21} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[19px] leading-tight">+ tirar isso da minha cabeça</span>
            <span className="block text-[13px] opacity-70 mt-0.5">escreve agora, organiza depois</span>
          </span>
        </button>
        {show('inbox') && h.inbox > 0 && (
          <button
            type="button"
            onClick={() => nav(ROUTES.inbox)}
            className="mt-2 w-full flex items-center gap-2 px-4 min-h-11 text-[14px] text-ink-2 rounded-2xl active:bg-surface-2"
          >
            <span aria-hidden>📥</span>
            <span className="flex-1 text-left">
              {pluralize(h.inbox, 'coisa', 'coisas')} na inbox <span className="text-muted">· quando der, organiza</span>
            </span>
            <ChevronRight size={16} className="text-muted/70" />
          </button>
        )}
      </>
    ),

    weekend: () => <WeekendCard db={db} today={today} trip={show('viagens') ? h.trip : undefined} />,

    plan: () =>
      h.planHighlight ? (
        <button
          type="button"
          onClick={() => nav(ROUTES.weekPlanner)}
          className="w-full rounded-[22px] bg-accent-soft px-4 py-4 flex items-center gap-3 text-left active:scale-[0.99] transition"
        >
          <span className="text-[26px]" aria-hidden>
            🗓️
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display text-[19px] leading-tight">Montar minha semana</span>
            <span className="block text-[13px] text-ink-2 mt-0.5">fixos, treinos, estudos e vida — você confirma no fim</span>
          </span>
          <ChevronRight size={18} className="text-accent shrink-0" />
        </button>
      ) : (
        <RowCard>
          <Row
            emoji={h.planConfirmed ? '✨' : '🗓️'}
            tone="accent"
            title={h.planConfirmed ? 'Semana montada ✨' : 'Montar minha semana'}
            text={h.planConfirmed ? 'dá pra ajustar quando quiser — mudar não é erro' : 'quando quiser reorganizar a semana'}
            onPress={() => nav(ROUTES.weekPlanner)}
          />
        </RowCard>
      ),

    top3: () => <VidaTop3 db={db} today={today} />,

    creative: () => (h.creative.length ? <CreativeCard slots={h.creative} today={today} /> : null),

    week: () =>
      show('metas') || show('revisao') ? (
        <>
          <SectionTitle>Esta semana</SectionTitle>
          {show('revisao') && reviewTime && (
            <button
              type="button"
              onClick={() => nav(ROUTES.weeklyReview)}
              className="w-full mb-3 rounded-[22px] bg-sage-soft px-4 py-4 flex items-center gap-3 text-left active:scale-[0.99] transition"
            >
              <span className="text-[26px]" aria-hidden>
                🌅
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-display text-[18px] leading-tight">Revisão da semana</span>
                <span className="block text-[13px] text-ink-2 mt-0.5">
                  é {WEEKDAY_LONG[weekday(today)]} — fechando a semana com carinho ✨
                </span>
              </span>
              <ChevronRight size={18} className="text-sage shrink-0" />
            </button>
          )}
          {show('metas') && (
            <button type="button" onClick={() => nav(ROUTES.goals)} className="card w-full p-4 text-left active:scale-[0.99] transition">
              <div className="flex items-center gap-3">
                <Badge emoji="🎯" tone="sage" />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium">Metas da semana</div>
                  <div className="text-[13px] text-muted">{weekGoalsLabel(h.goals.done, h.goals.total)}</div>
                </div>
                <ChevronRight size={18} className="text-muted/60 shrink-0" />
              </div>
              {h.goals.goals.length > 0 && (
                <ul className="mt-3 space-y-1.5 pl-[3.25rem]">
                  {h.goals.goals.slice(0, 3).map((g) => (
                    <li key={g.id} className="flex items-start gap-2 text-[14px] leading-snug">
                      <span className={cn('mt-[7px] h-1.5 w-1.5 rounded-full shrink-0', g.status === 'feita' ? 'bg-sage' : 'bg-line')} />
                      <span className={cn('min-w-0', g.status === 'feita' ? 'text-muted line-through decoration-muted/40' : 'text-ink-2')}>{g.title}</span>
                    </li>
                  ))}
                  {h.goals.goals.length > 3 && <li className="text-[13px] text-muted pl-3.5">+ {h.goals.goals.length - 3}</li>}
                </ul>
              )}
            </button>
          )}
          {show('revisao') && !reviewTime && (
            <div className="mt-3">
              <RowCard>
                <Row emoji="🌅" tone="accent" title="Revisão semanal" text="fica pro fim da semana — sem pressa" onPress={() => nav(ROUTES.weeklyReview)} />
              </RowCard>
            </div>
          )}
        </>
      ) : null,

    self: () =>
      show('corpo') || show('dinheiro') ? (
        <>
          <SectionTitle>Cuidar de mim</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {show('corpo') && (
              <div className={cn(!show('dinheiro') && 'col-span-2')}>
                <Tile emoji={h.body.emoji} tone="accent" title="Corpo" line={h.body.line} sub={h.body.sub} onPress={() => nav(ROUTES.body)} />
              </div>
            )}
            {show('dinheiro') && (
              <div className={cn(!show('corpo') && 'col-span-2')}>
                <Tile
                  emoji="💸"
                  tone="sand"
                  title="Dinheiro"
                  line={h.money.today ? `${formatBRLShort(h.money.today)} hoje` : 'nada hoje'}
                  sub={`${formatBRLShort(h.money.week)} na semana`}
                  onPress={() => nav(ROUTES.money)}
                />
              </div>
            )}
          </div>
        </>
      ) : null,

    home: () =>
      show('vida_real') || show('luna') ? (
        <>
          <SectionTitle>Casa & {h.luna.name}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {show('vida_real') && (
              <div className={cn(!show('luna') && 'col-span-2')}>
                <Tile emoji="🏠" tone="sage" title="Vida real" line={h.admin.line} sub={h.admin.sub} onPress={() => nav(ROUTES.lifeAdmin)} />
              </div>
            )}
            {show('luna') && (
              <div className={cn(!show('vida_real') && 'col-span-2')}>
                <Tile emoji="🐾" tone="plum" title={h.luna.name} line={h.luna.line} sub={h.luna.sub} onPress={() => nav(ROUTES.luna)} />
              </div>
            )}
          </div>
        </>
      ) : null,

    world: () =>
      show('viagens') || show('estudos') || show('livros') ? (
        <>
          <SectionTitle>Mundo</SectionTitle>
          {show('viagens') && (
            <div className="mb-3">
              <TripCard trip={h.trip} today={today} onPress={() => nav(ROUTES.trips)} />
            </div>
          )}
          {(show('estudos') || show('livros')) && (
            <RowCard>
              {show('estudos') && (
                <Row
                  emoji="📚"
                  tone="ocean"
                  title="Estudos"
                  text={h.study ? `agora: ${h.study}` : 'nada em andamento — escolhe um quando quiser'}
                  onPress={() => nav(ROUTES.study)}
                />
              )}
              {show('livros') && (
                <Row emoji="📖" tone="plum" title="Livros" text={h.book ? `lendo: ${h.book}` : 'nenhum livro aberto agora'} onPress={() => nav(ROUTES.books)} />
              )}
            </RowCard>
          )}
        </>
      ) : null,

    month: () =>
      show('mes') ? (
        <>
          <SectionTitle>Olhar pra trás</SectionTitle>
          <RowCard>
            <Row emoji="🗓️" tone="sand" title="Meu mês" text={`${formatMonth(today)} — o que valeu a pena`} onPress={() => nav(ROUTES.monthlyReview)} />
          </RowCard>
        </>
      ) : null,
  }

  return (
    <Page>
      <PageHeader eyebrow={formatLongDate(today)} title="Vida" subtitle={h.subtitle} />
      {order.map((id, i) => {
        const node = blocks[id]()
        if (!node) return null
        return (
          <motion.div key={id} {...enter(i)} className={cn(i > 0 && !['week', 'self', 'home', 'world', 'month'].includes(id) && 'mt-3')} data-block={id}>
            {node}
          </motion.div>
        )
      })}
    </Page>
  )
}

// ─── Data ───────────────────────────────────────────────────────────────────

function hubData(db: DB, today: DateKey) {
  const inbox = db.brainDump.filter((b) => b.status === 'inbox').length
  const goals = weekGoalsSummary(db, today)
  const wd = weekday(today)

  const workout = workoutsOn(db, today).find((w) => w.status !== 'descanso' && w.status !== 'pulado')
  const rest = workoutsOn(db, today).some((w) => w.status === 'descanso')
  const checkin = checkinFor(db, today)
  const checked = !!(checkin && (checkin.energia || checkin.sono || checkin.corpo || checkin.humor))
  let body: { emoji: string; line: string; sub: string }
  if (workout) {
    const m = modalityOf(db, workout.modality)
    const done = workout.status === 'feito' || workout.status === 'adaptado'
    body = {
      emoji: m.emoji,
      line: `${workout.title || m.label}${done ? ' ✓' : workout.time ? ` · ${workout.time}` : ''}`,
      sub: checked ? 'check-in feito' : 'como tá o corpo hoje?',
    }
  } else {
    body = { emoji: rest ? '🌿' : '🏃‍♀️', line: rest ? 'dia de descanso' : 'sem treino hoje', sub: checked ? 'check-in feito' : 'como tá o corpo hoje?' }
  }

  const pet = lunaOf(db)
  const name = pet?.name ?? 'Luna'
  const split = lunaTodaySplit(db, today)
  const pending = lunaPendingToday(db, today)
  const out = isLunaOutOfRoutine(db, today)
  const openRoutines = split.routines.filter((s) => !s.doneToday)
  const luna = {
    name,
    line: out
      ? 'fora da rotina hoje'
      : pending
        ? `${pending} pra resolver`
        : split.routines.length && !openRoutines.length
          ? 'rotina feita 💛'
          : 'rotina leve hoje',
    sub: out
      ? 'nada fica pendente 🏡'
      : openRoutines.length
        ? openRoutines
            .slice(0, 2)
            .map((s) => s.task.title.toLowerCase())
            .join(', ')
        : 'só carinho hoje',
  }

  const a = lifeAdminCounts(db, today)
  const admin = {
    line: a.hoje ? `${a.hoje} pra hoje` : a.semana ? `${a.semana} na semana` : 'tudo em ordem',
    sub:
      a.hoje && a.semana > a.hoje
        ? `${a.semana} na semana`
        : a.waiting
          ? `${a.waiting} esperando alguém`
          : a.review
            ? `${a.review} pra conferir`
            : 'casa, esportes, papéis',
  }

  const planConfirmed = weekPlanConfirmed(db, today)
  const subtitle =
    wd === 6 ? 'sábado — escolhe o que combina com teu dia' : wd === 0 ? 'domingo — devagar também é movimento' : wd === 5 ? 'fechando a semana ✨' : 'o que importa fora do trabalho'

  return {
    inbox,
    goals,
    body,
    money: spendSummary(db, today),
    admin,
    luna,
    trip: nextTrip(db, today),
    study: studyingNow(db)[0]?.title,
    book: readingNow(db)[0]?.title,
    creative: creativeThisWeek(db, today),
    planConfirmed,
    planHighlight: isPlanningDay(today) && !planConfirmed,
    subtitle,
  }
}

// ─── Blocks ─────────────────────────────────────────────────────────────────

function WeekendCard({ db, today, trip }: { db: DB; today: DateKey; trip: ReturnType<typeof nextTrip> }) {
  const sat = weekday(today) === 6
  const list = workoutsOn(db, today).filter((w) => w.status !== 'pulado' && w.status !== 'descanso')
  const days = trip ? daysUntil(today, trip.startDate) : undefined
  return (
    <div className="rounded-[22px] bg-sand-soft p-4">
      <div className="eyebrow">{sat ? 'Sábado livre' : 'Domingo leve'}</div>
      <div className="font-display text-[22px] leading-tight mt-1">{sat ? 'O que combina com teu sábado? ✨' : 'Descanso também conta 🌿'}</div>
      {list.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {list.map((w) => {
            const m = modalityOf(db, w.modality)
            const done = w.status === 'feito' || w.status === 'adaptado'
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => openSheet('workout', { id: w.id })}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface text-[13.5px] text-ink active:scale-[0.97] transition"
              >
                <span aria-hidden>{m.emoji}</span>
                {w.title || m.label}
                {done && <span className="text-sage">✓</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-[13.5px] text-ink-2 mt-1">
          {sat ? 'pedal, surf, corrida, circo, praia ou nada — tudo vale.' : 'se bater vontade de um pedal longo, cabe aqui também.'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openSheet('workout', { date: today })}
          className="inline-flex items-center gap-1 h-9 px-3.5 rounded-full bg-ink text-bg text-[13px] font-medium active:opacity-85"
        >
          <Plus size={14} />
          atividade
        </button>
        {trip && days != null && days > 0 && (
          <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface/70 text-[13px] text-ink-2">
            {trip.flag} {trip.name} · {days === 1 ? 'amanhã' : `${days} dias`}
          </span>
        )}
      </div>
    </div>
  )
}

function VidaTop3({ db, today }: { db: DB; today: DateKey }) {
  const list = useMemo(() => vidaPriorities(db, today), [db, today])
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const add = () => {
    const title = text.trim()
    if (!title || list.length >= 3) return
    const order = list.reduce((m, p) => Math.max(m, p.order), -1) + 1
    actions.create('priorities', { date: today, domain: 'vida', title, order, done: false })
    haptic('light')
    setText('')
    if (list.length + 1 >= 3) setAdding(false)
  }
  return (
    <div className="card overflow-hidden">
      <div className="px-4 pt-3.5 pb-1 flex items-center justify-between">
        <span className="eyebrow">Top 3 · Vida</span>
        <span className="text-[12px] text-muted">{list.length ? `${list.filter((p) => p.done).length}/${list.length}` : 'hoje'}</span>
      </div>
      {list.length === 0 && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="w-full text-left px-4 pb-3.5 pt-1 min-h-11 active:bg-surface-2">
          <span className="block text-[15px] text-ink-2">O que realmente importa na tua vida hoje?</span>
          <span className="block text-[13px] text-muted mt-0.5">até 3 coisas — fora do trabalho</span>
        </button>
      )}
      {list.length > 0 && (
        <ul className="divide-y divide-line/70">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 min-h-[52px]">
              <Checkbox
                checked={p.done}
                label={p.done ? `Desmarcar ${p.title}` : `Concluir ${p.title}`}
                onChange={(done) => {
                  actions.update('priorities', p.id, { done })
                  if (done) haptic('success')
                }}
              />
              <span className={cn('flex-1 min-w-0 text-[15px] leading-snug', p.done && 'text-muted line-through decoration-muted/50')}>{p.title}</span>
              <button
                type="button"
                onClick={() => {
                  actions.remove('priorities', p.id)
                  toast('Tirei do Top 3', { action: { label: 'Desfazer', run: () => actions.create('priorities', p) } })
                }}
                className="text-[12px] text-muted h-9 px-2 -mr-2"
                aria-label={`Tirar ${p.title} do Top 3`}
              >
                tirar
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length < 3 && (adding || list.length > 0) && (
        <form
          className="flex items-center gap-2 px-4 min-h-[52px] border-t border-line/70"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Plus size={16} className="text-muted shrink-0" />
          <input
            autoFocus={adding}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => !text.trim() && setAdding(false)}
            placeholder={list.length ? 'mais uma (opcional)' : 'ex.: ligar pra minha mãe'}
            className="flex-1 min-w-0 bg-transparent outline-none py-3 text-[15px] placeholder:text-muted"
            enterKeyHint="done"
            aria-label="Adicionar ao Top 3 da vida"
          />
          {text.trim() && (
            <button type="submit" className="h-9 px-3.5 rounded-full bg-ink text-bg text-[13px] font-medium">
              ok
            </button>
          )}
        </form>
      )}
    </div>
  )
}

function CreativeCard({ slots, today }: { slots: CreativeSlot[]; today: DateKey }) {
  const cancel = (s: CreativeSlot) => {
    const ex = s.event.exdates ?? []
    actions.update('events', s.event.id, { exdates: [...ex, s.date] })
    toast('Cancelado só essa semana', {
      action: { label: 'Desfazer', run: () => actions.update('events', s.event.id, { exdates: ex }) },
    })
  }
  const restore = (s: CreativeSlot) => {
    actions.update('events', s.event.id, { exdates: (s.event.exdates ?? []).filter((d) => d !== s.date) })
    toast('Voltou pra agenda 🎨')
  }
  return (
    <>
      <SectionTitle>Criatividade · próximos dias</SectionTitle>
      <div className="card overflow-hidden divide-y divide-line/70">
        {slots.map((s) => (
          <div key={`${s.event.id}-${s.date}`} className="flex items-center gap-3 px-4 min-h-[60px] py-2">
            <Badge emoji="🎨" tone="plum" />
            <button
              type="button"
              onClick={() => openSheet('event', { id: s.event.id, date: s.date })}
              className="flex-1 min-w-0 text-left"
            >
              <span className={cn('block text-[15px] font-medium truncate', s.cancelled && 'text-muted line-through decoration-muted/50')}>{s.event.title}</span>
              <span className="block text-[13px] text-muted truncate">{s.cancelled ? `${s.when} · fora dessa semana` : s.when}</span>
            </button>
            {s.recurring && s.date >= today && (
              <button
                type="button"
                onClick={() => (s.cancelled ? restore(s) : cancel(s))}
                className="shrink-0 h-9 px-3 rounded-full bg-surface-2 text-[12.5px] text-ink-2 active:bg-line"
              >
                {s.cancelled ? 'voltar' : 'não vou essa'}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function Badge({ emoji, tone }: { emoji: string; tone: Tone }) {
  return (
    <span className={cn('h-10 w-10 rounded-full flex items-center justify-center text-[19px] shrink-0', TONE[tone].soft)} aria-hidden>
      {emoji}
    </span>
  )
}

function Tile({ emoji, tone, title, line, sub, onPress }: { emoji: string; tone: Tone; title: string; line: string; sub?: string; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} className="card w-full h-full p-4 text-left flex flex-col active:scale-[0.98] transition">
      <Badge emoji={emoji} tone={tone} />
      <div className="mt-3 text-[13px] text-muted">{title}</div>
      <div className="font-display text-[18px] leading-tight mt-0.5">{line}</div>
      {sub && <div className="text-[12.5px] text-muted mt-1 line-clamp-2">{sub}</div>}
    </button>
  )
}

function RowCard({ children }: { children: ReactNode }) {
  return <div className="card overflow-hidden divide-y divide-line/70">{children}</div>
}

function Row({ emoji, tone, title, text, onPress }: { emoji: string; tone: Tone; title: string; text: string; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} className="w-full flex items-center gap-3 min-h-[64px] px-4 py-3 text-left active:bg-surface-2 transition-colors">
      <Badge emoji={emoji} tone={tone} />
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[13px] text-muted truncate">{text}</span>
      </span>
      <ChevronRight size={18} className="text-muted/60 shrink-0" />
    </button>
  )
}

function TripCard({ trip, today, onPress }: { trip: ReturnType<typeof nextTrip>; today: string; onPress: () => void }) {
  if (!trip) {
    return (
      <RowCard>
        <Row emoji="✈️" tone="ocean" title="Viagens" text="nenhuma no radar — dá pra sonhar uma 🌍" onPress={onPress} />
      </RowCard>
    )
  }
  const days = daysUntil(today, trip.startDate)
  const when = trip.startDate
    ? `${formatShortDate(trip.startDate)}${trip.datesConfirmed ? '' : ' · a confirmar'}`
    : (trip.dateLabel ?? 'datas a definir')
  return (
    <button type="button" onClick={onPress} className={cn('w-full rounded-[22px] p-4 text-left active:scale-[0.99] transition flex items-center gap-4', TONE[trip.tone]?.soft ?? 'bg-ocean-soft')}>
      <span className="text-[36px] leading-none" aria-hidden>
        {trip.flag}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block eyebrow">Próxima viagem</span>
        <span className="block font-display text-[20px] leading-tight mt-0.5 truncate">{trip.name}</span>
        <span className="block text-[13px] text-ink-2 mt-0.5">{when}</span>
      </span>
      {days != null && days > 0 && trip.datesConfirmed && (
        <span className="text-center shrink-0">
          <span className="block font-display text-[28px] leading-none">{days}</span>
          <span className="block text-[11px] text-muted mt-1">{days === 1 ? 'dia' : 'dias'}</span>
        </span>
      )}
    </button>
  )
}
