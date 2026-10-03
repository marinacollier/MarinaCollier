import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { useDB } from '@/data/store'
import type { DateKey, MealPrepPlan } from '@/data/types'
import { parseSubstitution, recipeFor, type MenuItem, type Servings } from '@/data/mealprep'
import { Segmented, SheetLayout } from '@/components/ui'
import { cn } from '@/lib/cn'
import { SourceBadge } from './components'

export function RecipeSheet({ date, mealIndex, plan, onClose }: { date: DateKey; mealIndex: number; plan?: MealPrepPlan; onClose: () => void }) {
  const db = useDB()
  const [servings, setServings] = useState<Servings>(1)
  const recipe = useMemo(() => recipeFor(db, date, mealIndex, servings, plan), [db, date, mealIndex, servings, plan])
  if (!recipe) return <SheetLayout title="Receita" onClose={onClose}>{null}</SheetLayout>
  return (
    <SheetLayout eyebrow={recipe.context} title={recipe.assembly ? 'Monte assim' : 'Receita'} onClose={onClose}>
      <h3 className="font-display text-[24px] leading-tight -mt-1">
        <span className="mr-1.5" aria-hidden>
          {recipe.emoji}
        </span>
        {recipe.title}
      </h3>
      <Segmented<'1' | '4'>
        value={String(servings) as '1' | '4'}
        onChange={(v) => setServings(Number(v) as Servings)}
        options={[
          { value: '1', label: 'Fazer 1 porção' },
          { value: '4', label: '4 porções (meal prep)' },
        ]}
      />
      <section>
        <div className="eyebrow mb-2">ingredientes</div>
        <ul className="space-y-1.5">
          {recipe.ingredients.map((i) => (
            <li key={i.food} className="flex items-baseline gap-2 text-[15px]">
              <span className="flex-1 min-w-0 leading-snug">{i.food}</span>
              <span className="shrink-0 font-semibold tabular-nums">{i.amount}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {recipe.ingredients.some((i) => i.badge === 'troca') && <SourceBadge badge="troca" />}
          <SourceBadge badge="nutri" />
        </div>
      </section>
      <section>
        <div className="eyebrow mb-2">{recipe.assembly ? 'monte assim' : 'modo de preparo'}</div>
        <ol className="space-y-2">
          {recipe.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-snug">
              <span className="h-6 w-6 shrink-0 rounded-full bg-surface-2 text-[12px] font-semibold flex items-center justify-center">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="rounded-2xl bg-surface-2 p-3.5 space-y-2 text-[14px] leading-snug">
        <Row label="Porção final" text={recipe.portion} />
        <Row label="Como armazenar" text={recipe.store} />
        <Row label="Como levar" text={recipe.carry} />
        <Row label="Como aquecer" text={recipe.reheat} />
      </section>
      <p className="text-[12.5px] text-muted">{recipe.note}</p>
    </SheetLayout>
  )
}

function Row({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="font-semibold">{label}: </span>
      <span className="text-ink-2">{text}</span>
    </div>
  )
}

/** Swap an item ONLY for one of the nutritionist's substitutions (or back to the original). */
export function SwapSheet({ item, current, onPick, onClose }: { item: MenuItem; current?: string; onPick: (value: string | undefined) => void; onClose: () => void }) {
  const original = item.original ?? { food: item.food, qty: item.qty }
  const options = item.substitutions
  return (
    <SheetLayout eyebrow="trocas do seu nutri" title="Trocar" onClose={onClose}>
      <h3 className="font-display text-[20px] leading-tight -mt-1">{original.food}</h3>
      <p className="text-[14px] text-muted">Só aparecem as substituições que o seu nutricionista cadastrou — a quantidade já vem equivalente.</p>
      <div className="card overflow-hidden divide-y divide-line/70">
        <Option title={original.food} subtitle={original.qty ? `${original.qty} · plano original` : 'plano original'} selected={!current} onClick={() => onPick(undefined)} />
        {options.map((o) => {
          const s = parseSubstitution(o)
          return <Option key={o} title={s.food} subtitle={s.qty} selected={current === o} onClick={() => onPick(o)} />
        })}
      </div>
    </SheetLayout>
  )
}

function Option({ title, subtitle, selected, onClick }: { title: string; subtitle?: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('w-full flex items-center gap-3 min-h-[56px] px-4 py-2.5 text-left transition-colors', selected ? 'bg-accent-soft' : 'active:bg-surface-2')}>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] leading-snug">{title}</div>
        {subtitle && <div className="text-[13px] text-muted mt-0.5">{subtitle}</div>}
      </div>
      {selected && <Check size={18} className="text-accent shrink-0" />}
    </button>
  )
}
