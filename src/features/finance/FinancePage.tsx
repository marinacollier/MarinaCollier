import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import { Button, Card, IconButton, Page, PageHeader } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatBRLShort } from '@/lib/money'
import { comparePeriods, comparisonText, topTotals } from './selectors'
import { Reveal } from './parts'
import { PeriodSection } from './PeriodSection'
import { PlannedSection } from './PlannedSection'
import { QuickQuestions } from './QuickQuestions'
import { DuplicatesSection } from './DuplicatesSection'
import { CategoriesEditor } from './CategoriesEditor'
import { ConnectionsSection } from './ConnectionsSection'
import { IncomeSection } from './IncomeSection'
import { BillsSection } from './BillsSection'
import { LockGate } from '@/components/layout/LockGate'

function Stat({ label, cents, big }: { label: string; cents: number; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow truncate">{label}</div>
      <div className={big ? 'font-display text-[30px] leading-tight tabular-nums mt-0.5' : 'font-display text-[21px] leading-tight tabular-nums mt-1.5'}>
        {formatBRLShort(cents)}
      </div>
    </div>
  )
}

/** Dinheiro: consciência diária, nunca julgamento. Protected by the optional privacy lock. */
export default function FinancePageGuarded() {
  return (
    <LockGate area="dinheiro">
      <FinancePage />
    </LockGate>
  )
}

function FinancePage() {
  const expenses = useDB((db) => db.expenses)
  const categories = useDB((db) => db.financialCategories)
  const trips = useDB((db) => db.trips)
  const accounts = useDB((db) => db.financialAccounts)
  const integrations = useDB((db) => db.integrations)
  const organizzeEnabled = useDB((db) => db.profile.featureFlags.organizzeEnabled)
  const today = useToday()

  const totals = useMemo(() => topTotals(expenses, today), [expenses, today])
  const weekLine = useMemo(() => comparisonText(comparePeriods(expenses, 'week', today, today)), [expenses, today])
  const monthLine = useMemo(() => comparisonText(comparePeriods(expenses, 'month', today, today)), [expenses, today])

  return (
    <Page>
      <PageHeader
        title="Dinheiro"
        subtitle="pra saber pra onde vai, sem peso"
        actions={
          <IconButton label="Anotar gasto" onClick={() => openSheet('expense')}>
            <Plus size={22} />
          </IconButton>
        }
      />

      <Reveal>
        <Card className="p-5">
          <div className="grid grid-cols-[1.15fr_1fr_1fr] gap-3 items-end">
            <Stat label="Hoje" cents={totals.today} big />
            <Stat label="Semana" cents={totals.week} />
            <Stat label="Mês" cents={totals.month} />
          </div>
          {totals.today === 0 && <p className="mt-3 text-[14px] text-ink-2">Nenhum gasto hoje. Leve assim ✨</p>}
          {(weekLine || monthLine) && (
            <div className="mt-3 pt-3 border-t border-line/70 space-y-1 text-[13.5px] text-muted">
              {weekLine && <p>Semana: {weekLine}</p>}
              {monthLine && <p>Mês: {monthLine}</p>}
            </div>
          )}
          <Button variant="primary" block className="mt-4" icon={<Plus size={18} />} onClick={() => openSheet('expense')}>
            Anotar gasto
          </Button>
        </Card>
      </Reveal>

      <Reveal delay={0.02}>
        <IncomeSection today={today} />
      </Reveal>

      <Reveal delay={0.03}>
        <BillsSection today={today} />
      </Reveal>

      <Reveal delay={0.04}>
        <DuplicatesSection expenses={expenses} categories={categories} />
      </Reveal>

      <Reveal delay={0.08}>
        <PeriodSection expenses={expenses} categories={categories} today={today} />
      </Reveal>

      <Reveal delay={0.12}>
        <PlannedSection expenses={expenses} categories={categories} today={today} />
      </Reveal>

      <Reveal delay={0.16}>
        <QuickQuestions expenses={expenses} categories={categories} trips={trips} today={today} />
      </Reveal>

      <Reveal delay={0.2}>
        <CategoriesEditor categories={categories} />
      </Reveal>

      <Reveal delay={0.24}>
        <ConnectionsSection accounts={accounts} integrations={integrations} organizzeEnabled={organizzeEnabled} />
      </Reveal>
    </Page>
  )
}
