import { useSearchParams } from 'react-router-dom'
import { Plus, UtensilsCrossed, Sprout } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { IconButton, Page, PageHeader, Segmented } from '@/components/ui'
import { openSheet } from '@/app/ui-store'
import { useToday } from '@/hooks/useToday'
import { formatLongDate } from '@/lib/date'
import TodayTab from './TodayTab'
import WeekTab from './WeekTab'
import HistoryTab from './HistoryTab'
import GoalsTab from './GoalsTab'

/** Three tabs; Objetivos + Histórico live together in "Progresso" (old ?aba=objetivos lands there). */
type Tab = 'hoje' | 'semana' | 'progresso'
const TABS: { value: Tab; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'progresso', label: 'Progresso' },
]
const LEGACY: Record<string, Tab> = { historico: 'progresso', objetivos: 'progresso' }

export default function BodyPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const raw = params.get('aba') ?? ''
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : (LEGACY[raw] ?? 'hoje')

  return (
    <Page>
      <PageHeader
        eyebrow={formatLongDate(today)}
        title="Corpo"
        subtitle="treino, comida e você"
        actions={
          <>
          <IconButton label="Estratégia nutricional" onClick={() => nav(ROUTES.nutrition)}>
            <UtensilsCrossed size={20} />
          </IconButton>
          <IconButton label="Evolução" onClick={() => nav(ROUTES.bodyEvolution)}>
            <Sprout size={20} />
          </IconButton>
          <IconButton label={tab === 'progresso' ? 'Novo objetivo' : 'Planejar treino'} onClick={() => (tab === 'progresso' ? openSheet('workoutGoal', {}) : openSheet('workout', { date: today }))}>
            <Plus size={22} />
          </IconButton>
          </>
        }
      />
      <Segmented
        value={tab}
        onChange={(v) => setParams(v === 'hoje' ? {} : { aba: v }, { replace: true })}
        options={TABS}
        className="mb-5"
      />
      {tab === 'hoje' && <TodayTab today={today} />}
      {tab === 'semana' && <WeekTab today={today} />}
      {tab === 'progresso' && (
        <div className="space-y-8">
          <GoalsTab today={today} />
          <HistoryTab today={today} />
        </div>
      )}
    </Page>
  )
}
