import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { IconButton, Page, PageHeader, Segmented } from '@/components/ui'
import { openSheet } from '@/app/ui-store'
import { useToday } from '@/hooks/useToday'
import { formatLongDate } from '@/lib/date'
import TodayTab from './TodayTab'
import WeekTab from './WeekTab'
import HistoryTab from './HistoryTab'
import GoalsTab from './GoalsTab'

type Tab = 'hoje' | 'semana' | 'historico' | 'objetivos'
const TABS: { value: Tab; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'historico', label: 'Histórico' },
  { value: 'objetivos', label: 'Objetivos' },
]

export default function BodyPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const raw = params.get('aba') as Tab | null
  const tab: Tab = TABS.some((t) => t.value === raw) ? raw! : 'hoje'

  return (
    <Page>
      <PageHeader
        eyebrow={formatLongDate(today)}
        title="Corpo"
        subtitle="treino, comida e como você está — sem pressão."
        actions={
          <IconButton label={tab === 'objetivos' ? 'Novo objetivo' : 'Planejar treino'} onClick={() => (tab === 'objetivos' ? openSheet('workoutGoal', {}) : openSheet('workout', { date: today }))}>
            <Plus size={22} />
          </IconButton>
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
      {tab === 'historico' && <HistoryTab today={today} />}
      {tab === 'objetivos' && <GoalsTab today={today} />}
    </Page>
  )
}
