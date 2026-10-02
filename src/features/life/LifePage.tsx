import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Brain, ChevronRight } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import type { DB, ModuleId, Tone } from '@/data/types'
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
import { Page, PageHeader, SectionTitle, TONE } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatBRLShort } from '@/lib/money'
import { formatLongDate, formatShortDate, formatMonth, weekday, WEEKDAY_LONG } from '@/lib/date'
import { pluralize } from '@/lib/text'
import { cn } from '@/lib/cn'
import {
  isModuleVisible,
  isReviewTime,
  lifeAdminCounts,
  lunaOf,
  lunaPendingToday,
  lunaToday,
  weekGoalsLabel,
  weekGoalsSummary,
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
  let i = 0

  return (
    <Page>
      <PageHeader eyebrow={formatLongDate(today)} title="Vida" subtitle="o que importa fora do trabalho" />

      {/* Capture */}
      <motion.div {...enter(i++)}>
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
      </motion.div>
      {show('inbox') && h.inbox > 0 && (
        <motion.button
          {...enter(i++)}
          type="button"
          onClick={() => nav(ROUTES.inbox)}
          className="mt-2 w-full flex items-center gap-2 px-4 min-h-11 text-[14px] text-ink-2 rounded-2xl active:bg-surface-2"
        >
          <span aria-hidden>📥</span>
          <span className="flex-1 text-left">
            {pluralize(h.inbox, 'coisa', 'coisas')} na inbox <span className="text-muted">· quando der, organiza</span>
          </span>
          <ChevronRight size={16} className="text-muted/70" />
        </motion.button>
      )}

      {/* Esta semana */}
      {(show('metas') || show('revisao')) && <SectionTitle>Esta semana</SectionTitle>}
      {show('revisao') && reviewTime && (
        <motion.button
          {...enter(i++)}
          type="button"
          onClick={() => nav(ROUTES.weeklyReview)}
          className="w-full mb-3 rounded-[22px] bg-accent-soft px-4 py-4 flex items-center gap-3 text-left active:scale-[0.99] transition"
        >
          <span className="text-[26px]" aria-hidden>
            🌅
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display text-[18px] leading-tight">Revisão da semana</span>
            <span className="block text-[13px] text-ink-2 mt-0.5">
              é {WEEKDAY_LONG[weekday(today)]} — 10 minutinhos pra fechar a semana com carinho
            </span>
          </span>
          <ChevronRight size={18} className="text-accent shrink-0" />
        </motion.button>
      )}
      {show('metas') && (
        <motion.div {...enter(i++)}>
          <button
            type="button"
            onClick={() => nav(ROUTES.goals)}
            className="card w-full p-4 text-left active:scale-[0.99] transition"
          >
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
        </motion.div>
      )}
      {show('revisao') && !reviewTime && (
        <motion.div {...enter(i++)} className="mt-3">
          <RowCard>
            <Row emoji="🌅" tone="accent" title="Revisão semanal" text="fica pra sexta — sem pressa" onPress={() => nav(ROUTES.weeklyReview)} />
          </RowCard>
        </motion.div>
      )}

      {/* Cuidar de mim */}
      {(show('corpo') || show('dinheiro')) && <SectionTitle>Cuidar de mim</SectionTitle>}
      <div className="grid grid-cols-2 gap-3">
        {show('corpo') && (
          <motion.div {...enter(i++)} className={cn(!show('dinheiro') && 'col-span-2')}>
            <Tile emoji={h.body.emoji} tone="accent" title="Corpo" line={h.body.line} sub={h.body.sub} onPress={() => nav(ROUTES.body)} />
          </motion.div>
        )}
        {show('dinheiro') && (
          <motion.div {...enter(i++)} className={cn(!show('corpo') && 'col-span-2')}>
            <Tile
              emoji="💸"
              tone="sand"
              title="Dinheiro"
              line={h.money.today ? `${formatBRLShort(h.money.today)} hoje` : 'nada hoje'}
              sub={`${formatBRLShort(h.money.week)} na semana`}
              onPress={() => nav(ROUTES.money)}
            />
          </motion.div>
        )}
      </div>

      {/* Casa & Luna */}
      {(show('vida_real') || show('luna')) && <SectionTitle>Casa & Luna</SectionTitle>}
      <div className="grid grid-cols-2 gap-3">
        {show('vida_real') && (
          <motion.div {...enter(i++)} className={cn(!show('luna') && 'col-span-2')}>
            <Tile
              emoji="🏡"
              tone="sage"
              title="Vida real"
              line={h.admin.hoje ? `${h.admin.hoje} pra hoje` : h.admin.semana ? `${h.admin.semana} na semana` : 'tudo em ordem'}
              sub={
                h.admin.hoje && h.admin.semana > h.admin.hoje
                  ? `${h.admin.semana} na semana`
                  : h.admin.review
                    ? `${h.admin.review} pra conferir`
                    : 'casa, carro, papéis'
              }
              onPress={() => nav(ROUTES.lifeAdmin)}
            />
          </motion.div>
        )}
        {show('luna') && (
          <motion.div {...enter(i++)} className={cn(!show('vida_real') && 'col-span-2')}>
            <Tile emoji="🐾" tone="plum" title={h.luna.name} line={h.luna.line} sub={h.luna.sub} onPress={() => nav(ROUTES.luna)} />
          </motion.div>
        )}
      </div>

      {/* Mundo */}
      {(show('viagens') || show('estudos') || show('livros')) && <SectionTitle>Mundo</SectionTitle>}
      {show('viagens') && (
        <motion.div {...enter(i++)} className="mb-3">
          <TripCard trip={h.trip} today={today} onPress={() => nav(ROUTES.trips)} />
        </motion.div>
      )}
      {(show('estudos') || show('livros')) && (
        <motion.div {...enter(i++)}>
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
              <Row
                emoji="📖"
                tone="plum"
                title="Livros"
                text={h.book ? `lendo: ${h.book}` : 'nenhum livro aberto agora'}
                onPress={() => nav(ROUTES.books)}
              />
            )}
          </RowCard>
        </motion.div>
      )}

      {show('mes') && (
        <>
          <SectionTitle>Olhar pra trás</SectionTitle>
          <motion.div {...enter(i++)}>
            <RowCard>
              <Row emoji="🗓️" tone="sand" title="Meu mês" text={`${formatMonth(today)} — o que valeu a pena`} onPress={() => nav(ROUTES.monthlyReview)} />
            </RowCard>
          </motion.div>
        </>
      )}
    </Page>
  )
}

// ─── Data ───────────────────────────────────────────────────────────────────

function hubData(db: DB, today: string) {
  const inbox = db.brainDump.filter((b) => b.status === 'inbox').length
  const goals = weekGoalsSummary(db, today)

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
  const lunaList = lunaToday(db, today)
  const pending = lunaPendingToday(db, today)
  const luna = {
    name: pet?.name ?? 'Luna',
    line: pending ? `${pending} ${pending === 1 ? 'coisinha' : 'coisinhas'} hoje` : 'tudo em dia',
    sub: pending
      ? lunaList
          .filter((s) => !s.doneToday)
          .slice(0, 2)
          .map((s) => s.task.title.split(' — ')[0].toLowerCase())
          .join(', ')
      : lunaList.length
        ? 'feito por hoje 💛'
        : 'só carinho hoje',
  }

  return {
    inbox,
    goals,
    body,
    money: spendSummary(db, today),
    admin: lifeAdminCounts(db, today),
    luna,
    trip: nextTrip(db, today),
    study: studyingNow(db)[0]?.title,
    book: readingNow(db)[0]?.title,
  }
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
