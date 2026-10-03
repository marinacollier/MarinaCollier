/** Small visual pieces of the nutrition engine: badges, the quiet macros line, the suggestion card. */
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { ContentSource, DB, MealAdjustment, NutrientConfidence } from '@/data/types'
import { dayMeals, macroPairs, shortFood, type NutritionLedger } from '@/data/nutrition'
import { cn } from '@/lib/cn'
import { applyWithToast, keepPlanWithToast, nextOption } from './feedback'

const BADGE: Record<ContentSource, { label: string; className: string }> = {
  nutri: { label: 'nutri', className: 'text-sage border-sage/40' },
  troca: { label: 'troca do plano', className: 'text-ocean border-ocean/40' },
  lumos: { label: 'lumos', className: 'text-sand border-sand/50' },
  marina: { label: 'você', className: 'text-muted border-line' },
}

/** NUTRI · TROCA DO PLANO · LUMOS — a quiet tag, not a warning. */
export function SourceBadge({ source, className }: { source: ContentSource; className?: string }) {
  const b = BADGE[source]
  return <span className={cn('inline-flex items-center h-[18px] px-1.5 rounded-full border text-[10px] font-semibold uppercase tracking-[0.08em] leading-none shrink-0', b.className, className)}>{b.label}</span>
}

export const CONFIDENCE_LABEL: Record<NutrientConfidence, string> = {
  label: 'rótulo',
  reference: 'tabela TACO',
  plan: 'do plano',
  estimated: 'estimativa',
  unknown: 'sem números',
}

/** "Detalhes do dia": consumido / planejado for P · C · G — thin lines, kcal behind a tap. */
export function MacroSummary({ ledger }: { ledger: NutritionLedger }) {
  const [showKcal, setShowKcal] = useState(false)
  const pairs = macroPairs(ledger)
  return (
    <div>
      <div className="space-y-3">
        {pairs.map((p) => {
          const pct = p.planned > 0 ? Math.min(1, p.consumed / p.planned) : 0
          return (
            <div key={p.key}>
              <div className="flex items-baseline justify-between text-[13.5px]">
                <span className="text-ink-2">{p.label}</span>
                <span className="tabular-nums text-ink">
                  <span className="font-display text-[16px]">{p.consumed}</span>
                  <span className="text-muted"> / {p.planned} g</span>
                </span>
              </div>
              <div className="mt-1 h-[3px] rounded-full bg-surface-2 overflow-hidden">
                <motion.div className="h-full rounded-full bg-sage" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.5 }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-muted">
        <span>{ledger.partial ? 'aproximado — alguns itens sem números' : 'calculado do plano + tabela TACO'}</span>
        <button type="button" onClick={() => setShowKcal((s) => !s)} className="h-8 px-1 text-[12px] text-muted underline decoration-dotted underline-offset-2">
          {showKcal ? `${Math.round(ledger.consumed.kcal)} / ${Math.round(ledger.planned.kcal)} kcal` : 'kcal'}
        </button>
      </div>
    </div>
  )
}

function itemsLine(items: { food: string; grams?: number; badge?: ContentSource }[]): string {
  return items.map((i) => (i.badge && i.badge !== 'nutri' && i.grams ? `${shortFood(i.food)} ${i.grams}g` : shortFood(i.food))).join(' · ')
}

/** "Ajuste sugerido" — never silent: aplicar · manter plano · outra opção. */
export function AdjustmentCard({ db, adj, nowMinutes, className }: { db: DB; adj: MealAdjustment; nowMinutes: number; className?: string }) {
  const view = useMemo(() => dayMeals(db, adj.date, nowMinutes).meals.find((m) => m.ref === adj.planMealRef), [db, adj, nowMinutes])
  if (!view) return null
  const badge: ContentSource = adj.items.some((i) => i.badge === 'troca') ? 'troca' : 'lumos'
  return (
    <motion.div id="nutri-ajuste" initial={{ y: 6 }} animate={{ y: 0 }} className={cn('rounded-2xl bg-sand-soft/70 p-3.5 scroll-mt-24', className)}>
      <div className="eyebrow">✨ ajuste sugerido</div>
      <p className="text-[14px] leading-snug mt-1 text-ink">{adj.reason}</p>
      <div className="mt-2.5 space-y-1.5 text-[13px]">
        <div className="flex items-start gap-2">
          <span className="w-[86px] shrink-0 text-muted">{view.name}</span>
          <span className="flex-1 min-w-0 text-muted line-through decoration-muted/40">{itemsLine(view.original.items)}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-[86px] shrink-0 text-ink-2">sugestão</span>
          <span className="flex-1 min-w-0 text-ink">{itemsLine(adj.items)}</span>
          <SourceBadge source={badge} className="mt-0.5" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" onClick={() => applyWithToast(adj.id)} className="h-10 px-4 rounded-full bg-ink text-bg text-[13.5px] font-semibold active:scale-[0.97] transition">
          aplicar
        </button>
        <button type="button" onClick={() => keepPlanWithToast(adj.id)} className="h-10 px-4 rounded-full bg-surface text-ink-2 text-[13.5px] border border-line active:scale-[0.97] transition">
          manter plano
        </button>
        <button type="button" onClick={() => nextOption(adj.id)} className="h-10 px-3 text-[13.5px] text-accent font-medium active:opacity-70">
          outra opção
        </button>
      </div>
    </motion.div>
  )
}
