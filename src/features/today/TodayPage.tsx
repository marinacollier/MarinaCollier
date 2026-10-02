import { useMemo, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Inbox, Search } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { IconButton, Page } from '@/components/ui'
import { useDB } from '@/data/store'
import type { HomeWidgetId } from '@/data/types'
import { useNow } from '@/hooks/useToday'
import { formatLongDate, greeting } from '@/lib/date'
import { homeContext } from './context'
import { orderWidgets } from './layout'
import { greetingEmoji, phraseFor } from './phrases'
import { AgoraCard } from './widgets/AgoraCard'
import { AmanhaWidget, BrainDumpWidget, DaySummaryLine, EnergyPicker, LowEnergyNote, WeekWrapCard } from './widgets/ContextWidgets'
import { GastosWidget, RefeicoesWidget, TreinoWidget } from './widgets/DayWidgets'
import {
  ClosingWidget,
  CountdownWidget,
  LunaWidget,
  NextUpWidget,
  ReadingWidget,
  StudyWidget,
  TripWidget,
  WaitingWidget,
  WorkFocusWidget,
} from './widgets/InfoWidgets'
import { MorningWidget } from './widgets/MorningWidget'
import { TasksWidget } from './widgets/TasksWidget'
import { Top3Widget } from './widgets/Top3Widget'
import type { WidgetCtx } from './widgets/shared'

const WIDGETS: Record<HomeWidgetId, ComponentType<{ ctx: WidgetCtx }>> = {
  agora: AgoraCard,
  top3: Top3Widget,
  manha: MorningWidget,
  proximo_compromisso: NextUpWidget,
  treino: TreinoWidget,
  refeicoes: RefeicoesWidget,
  gastos: GastosWidget,
  tarefas: TasksWidget,
  proxima_viagem: TripWidget,
  lendo_agora: ReadingWidget,
  estudo_atual: StudyWidget,
  waiting_for: WaitingWidget,
  work_focus: WorkFocusWidget,
  luna: LunaWidget,
  countdown: CountdownWidget,
  fechamento: ClosingWidget,
  // Rendered in the header (see DaySummaryLine), never as a card.
  resumo_dia: () => null,
  brain_dump: BrainDumpWidget,
  amanha: AmanhaWidget,
}

export default function TodayPage() {
  const db = useDB()
  const { today, minutes } = useNow()
  const nav = useNavigate()
  const home = useMemo(() => homeContext(db, today, minutes), [db, today, minutes])
  const { part } = home
  const order = useMemo(() => orderWidgets(db.profile.homeWidgets, home), [db.profile.homeWidgets, home])
  const ctx: WidgetCtx = useMemo(() => ({ db, today, minutes, part, home }), [db, today, minutes, part, home])
  const showSummary = db.profile.homeWidgets.some((w) => w.id === 'resumo_dia' && w.visible)
  const showWeekWrap = home.mode === 'sexta'
  const inboxCount = useMemo(() => db.brainDump.filter((b) => b.status === 'inbox').length, [db.brainDump])
  const name = db.profile.name?.trim() || 'Marina'

  return (
    <Page>
      <header className="pt-2 pb-5">
        <div className="flex items-center justify-between min-h-11 -mx-1.5">
          <span className="px-1.5 text-[11px] tracking-[0.22em] uppercase text-muted font-semibold">Marina OS</span>
          <div className="flex items-center">
            <IconButton label={inboxCount ? `Inbox, ${inboxCount} itens` : 'Inbox'} onClick={() => nav(ROUTES.inbox)} className="relative">
              <Inbox size={20} />
              {inboxCount > 0 && (
                <span className="absolute top-1.5 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10.5px] font-semibold leading-[18px] text-center tabular-nums">
                  {inboxCount > 99 ? '99+' : inboxCount}
                </span>
              )}
            </IconButton>
            <IconButton label="Buscar" onClick={() => nav(ROUTES.search)}>
              <Search size={20} />
            </IconButton>
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="eyebrow mt-3 first-letter:uppercase">{formatLongDate(today)}</div>
          <h1 className="font-display text-[36px] leading-[1.05] tracking-tight mt-1.5">
            {greeting(minutes)}, {name} <span className="inline-block">{greetingEmoji(minutes)}</span>
          </h1>
          <p className="font-display italic text-[17px] text-ink-2/80 mt-2">{phraseFor(today)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
          {showSummary && <DaySummaryLine db={db} today={today} />}
          <EnergyPicker db={db} today={today} />
          {home.mode === 'baixa' && <LowEnergyNote />}
        </motion.div>
      </header>

      <div className="space-y-3.5">
        {order.map((id, i) => {
          const W = WIDGETS[id]
          if (!W) return null
          const card = (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + Math.min(i, 8) * 0.045, ease: [0.22, 1, 0.36, 1] }}
              className="empty:hidden"
            >
              <W ctx={ctx} />
            </motion.div>
          )
          // Friday evening: "Fechando a semana ✨" right after Agora.
          if (showWeekWrap && i === 0)
            return [
              card,
              <motion.div key="semana" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }}>
                <WeekWrapCard db={db} today={today} />
              </motion.div>,
            ]
          return card
        })}
      </div>

      <p className="text-center font-display italic text-[14px] text-muted mt-10">em constante movimento: corpo, mente e vida.</p>
    </Page>
  )
}
