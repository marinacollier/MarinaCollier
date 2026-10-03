/** Nutrition page sections: "Detalhes do dia" (quiet ledger) and "Meus alimentos". */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useDB } from '@/data/store'
import { useNow } from '@/hooks/useToday'
import { openSheet } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { Card, EmptyState, IconButton, ListCard, SectionTitle } from '@/components/ui'
import { dayMeals, nutritionLedger } from '@/data/nutrition'
import { cn } from '@/lib/cn'
import { AdjustmentCard, MacroSummary, SourceBadge } from './nutri-ui'
import { openNutritionSheet } from './sheet-host'

export function DayDetails() {
  const db = useDB()
  const { today, minutes } = useNow()
  const nav = useNavigate()
  const ledger = useMemo(() => nutritionLedger(db, today, minutes), [db, today, minutes])
  const proposal = useMemo(() => dayMeals(db, today, minutes).meals.find((m) => m.proposed)?.proposed, [db, today, minutes])
  const rows = useMemo(
    () =>
      [...ledger.entries].sort((a, b) => (a.consumedTime ?? a.plannedTime ?? '99').localeCompare(b.consumedTime ?? b.plannedTime ?? '99')),
    [ledger],
  )

  if (!ledger.plan && ledger.entries.length === 0) {
    return (
      <>
        <SectionTitle>detalhes do dia</SectionTitle>
        <Card>
          <EmptyState compact emoji="🍽️" title="Nada registrado hoje" text="Quando você comer algo, é só contar — eu organizo." />
        </Card>
      </>
    )
  }

  return (
    <>
      <SectionTitle
        action={
          <button type="button" onClick={() => openSheet('meal', { date: today })} className="h-11 px-2 text-[13px] font-medium text-accent inline-flex items-center gap-1">
            <Plus size={15} /> registrar
          </button>
        }
      >
        detalhes do dia
      </SectionTitle>
      <Card>
        {ledger.plan && <MacroSummary ledger={ledger} />}
        {proposal && <AdjustmentCard db={db} adj={proposal} nowMinutes={minutes} className="mt-4" />}
        <ul className={cn('divide-y divide-line/60', ledger.plan && 'mt-3 border-t border-line/60')}>
          {rows.map((e) => {
            const time = e.status === 'consumed' ? e.consumedTime : e.plannedTime
            return (
              <li key={e.ref ?? e.mealId}>
                <button
                  type="button"
                  onClick={() => (e.ref ? openNutritionSheet('mealDetail', { date: today, ref: e.ref }) : e.mealId && openSheet('meal', { id: e.mealId }))}
                  className="w-full flex items-center gap-3 min-h-[48px] py-1.5 text-left active:opacity-70"
                >
                  <span className={cn('font-sport text-[14px] w-11 shrink-0 tabular-nums', e.status === 'consumed' ? 'text-sage' : 'text-muted')}>{time ?? '—'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('text-[14px] truncate', e.status === 'skipped' ? 'text-muted' : 'text-ink')}>{e.name}</span>
                      {e.kind === 'plan' && e.source !== 'nutri' && <SourceBadge source={e.source} />}
                    </span>
                    <span className="block text-[12px] text-muted">
                      {e.status === 'consumed'
                        ? `✓ ${e.kind === 'extra' ? 'extra' : e.plannedTime && e.consumedTime !== e.plannedTime ? `planejado ${e.plannedTime}` : 'no horário'}`
                        : e.status === 'skipped'
                          ? 'fora hoje'
                          : e.status === 'past'
                            ? 'ficou sem marcar'
                            : 'ainda vem'}
                    </span>
                  </span>
                  <span className="text-[12px] text-muted tabular-nums shrink-0">
                    {e.status === 'skipped' ? '' : e.nutrients.protein > 0 ? `${e.partial ? '≈' : ''}${Math.round(e.nutrients.protein)} g prot.` : e.partial ? 'sem números' : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          onClick={() => nav(`${ROUTES.assistant}?q=${encodeURIComponent('como estão meus macros hoje?')}`)}
          className="mt-2 h-10 text-[13px] font-medium text-accent"
        >
          perguntar à Lumos →
        </button>
      </Card>
    </>
  )
}

export function MyFoods() {
  const foods = useDB((db) => db.foods)
  const mine = useMemo(() => foods.filter((f) => f.mine).sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || a.name.localeCompare(b.name)), [foods])
  return (
    <>
      <SectionTitle
        action={
          <IconButton size="sm" label="Novo alimento" onClick={() => openNutritionSheet('myFood', {})}>
            <Plus size={18} />
          </IconButton>
        }
      >
        meus alimentos
      </SectionTitle>
      {mine.length === 0 ? (
        <Card>
          <EmptyState
            compact
            emoji="🥤"
            title="Seus produtos de sempre"
            text="YoPRO, seu whey, seu pão… salve uma vez com o rótulo e depois é só um toque."
          />
        </Card>
      ) : (
        <ListCard>
          {mine.map((f) => (
            <button key={f.id} type="button" onClick={() => openNutritionSheet('myFood', { id: f.id })} className="w-full flex items-center gap-3 min-h-[52px] px-4 py-2 text-left active:bg-surface-2">
              <span className="text-[18px] w-6 text-center" aria-hidden>
                {f.emoji ?? '🍽️'}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] truncate">{f.name}</span>
                <span className="block text-[12px] text-muted truncate">
                  {f.serving.label} · {f.confidence === 'unknown' ? 'sem números' : `P ${f.nutrients.protein} · C ${f.nutrients.carbs} · G ${f.nutrients.fat}`}
                </span>
              </span>
              {!!f.uses && <span className="text-[11.5px] text-muted shrink-0">{f.uses}×</span>}
            </button>
          ))}
        </ListCard>
      )}
    </>
  )
}
