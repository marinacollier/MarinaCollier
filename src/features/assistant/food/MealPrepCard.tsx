/**
 * MEAL PREP MODE in chat — compact, in the section-15 order, with a button to the full screen.
 * Recipes keep the plan's quantities ("fazer 1 porção" / "fazer 4 porções").
 */
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { Chip, Segmented } from '@/components/ui'
import { dayMeals } from '@/data/nutrition'
import type { DateKey, DB } from '@/data/types'
import { hmToMinutes } from '@/lib/date'
import { cn } from '@/lib/cn'
import { MEAL_PREP_PATH, recipeForMeal, weekMealPrep } from '../mealprep-adapter'
import { onDay } from '../day/text'
import { mealFor } from './answer'
import type { MealPrepIntent } from './mealprep'

function Shell({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.45 }} className="card p-4 space-y-3.5">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <p className="font-display text-[19px] leading-snug mt-1">{title}</p>
      </div>
      {children}
    </motion.div>
  )
}

function Section({ title, lines, open: initial }: { title: string; lines: string[]; open?: boolean }) {
  const [open, setOpen] = useState(!!initial)
  return (
    <div className="border-t border-line/70 pt-2.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full min-h-9 flex items-center justify-between gap-2 text-left" aria-expanded={open}>
        <span className="text-[14px] font-medium">{title}</span>
        <ChevronDown size={16} className={cn('text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {lines.map((l, i) => (
            <li key={i} className="text-[13px] leading-snug text-ink-2">
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MealPrepCard({ db, today, nowMinutes, intent, onOpen }: { db: DB; today: DateKey; nowMinutes: number; intent: Exclude<MealPrepIntent, { kind: 'presencial' }>; onOpen: (to: string) => void }) {
  const week = useMemo(() => (intent.kind === 'week' ? weekMealPrep(db, today) : undefined), [db, today, intent.kind])
  const [portions, setPortions] = useState<'1' | '4'>(intent.kind === 'recipe' ? (String(intent.portions) as '1' | '4') : '1')
  const meal = useMemo(() => {
    if (intent.kind !== 'recipe') return undefined
    const now = intent.date === today ? nowMinutes : 0
    if (intent.meal) return mealFor(db, intent.date, intent.meal, now)
    // "essa porção": the next real meal still to come (else the last one of the day).
    const list = dayMeals(db, intent.date, now).meals.filter((m) => m.phase === 'refeicao' || !m.phase)
    return list.find((m) => m.status === 'future' && (!m.plannedTime || hmToMinutes(m.plannedTime) > now)) ?? list[list.length - 1]
  }, [db, intent, today, nowMinutes])
  const recipe = useMemo(() => (intent.kind === 'recipe' && meal ? recipeForMeal(db, intent.date, meal.ref, portions === '4' ? 4 : 1) : undefined), [db, intent, meal, portions])
  const open = <Chip onClick={() => onOpen(MEAL_PREP_PATH)}>Abrir Meal prep →</Chip>

  if (intent.kind === 'week') {
    if (!week) return <Shell eyebrow="✨ Lumos · meal prep" title="Ainda não tem plano do nutri cadastrado pra essa semana — sem plano eu não invento cardápio 🙂">{open}</Shell>
    return (
      <Shell eyebrow="✨ Lumos · meal prep" title={week.headline}>
        <div className="space-y-2.5">
          {week.sections.map((s, i) => (
            <Section key={s.title} title={`${i + 1}. ${s.title}`} lines={s.lines} open={i === 0} />
          ))}
        </div>
        <p className="text-[12px] text-muted">Quantidades e trocas só do plano do seu nutri. Dá pra variar sem transformar sua cozinha num restaurante 😂</p>
        {open}
      </Shell>
    )
  }

  if (!meal || !recipe) {
    return <Shell eyebrow="✨ Lumos · receita" title={`Não achei essa refeição no plano ${onDay(intent.date, today) === 'hoje' ? 'de hoje' : `de ${onDay(intent.date, today)}`}.`}>{open}</Shell>
  }
  return (
    <Shell eyebrow="✨ Lumos · receita" title={`${recipe.emoji} ${recipe.title}`}>
      <div className="flex items-center justify-between gap-3 -mt-1.5">
        <span className="text-[12.5px] text-muted">{recipe.context}</span>
        <Segmented
          value={portions}
          onChange={(v) => setPortions(v as '1' | '4')}
          options={[
            { value: '1', label: '1 porção' },
            { value: '4', label: '4 porções' },
          ]}
        />
      </div>
      <section>
        <div className="text-[13px] font-semibold text-ink-2 mb-1">Ingredientes</div>
        <ul className="space-y-0.5">
          {recipe.ingredients.map((i) => (
            <li key={i.food} className="text-[13.5px] leading-snug">
              {i.food} <span className="text-muted">· {i.amount}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <div className="text-[13px] font-semibold text-ink-2 mb-1">Modo de preparo</div>
        <ol className="space-y-1 list-decimal pl-4">
          {recipe.steps.map((s) => (
            <li key={s} className="text-[13.5px] leading-snug text-ink-2">
              {s}
            </li>
          ))}
        </ol>
      </section>
      <ul className="space-y-1 text-[13px] leading-snug text-ink-2">
        <li>🍽️ {recipe.portion}</li>
        <li>❄️ {recipe.store}</li>
        <li>🎒 {recipe.carry}</li>
        <li>🔥 {recipe.reheat}</li>
      </ul>
      <p className="text-[12px] text-muted">{recipe.note}</p>
      {open}
    </Shell>
  )
}
