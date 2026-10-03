/** One planned meal of the day: plan, quantities, macros, trocas, notes, badges, "perguntar à Lumos". */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, MessageCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDB } from '@/data/store'
import { useNow } from '@/hooks/useToday'
import { openSheet, toast } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { SheetLayout } from '@/components/ui'
import { dayMeals, dismissAdjustment, plannedFoodInfo, saveAdjustment, skipMeal, swapDraft, type BadgedFood } from '@/data/nutrition'
import { dayTrainingContext } from '@/data/fuel'
import type { DateKey, Nutrients } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { relativeDay } from '@/lib/date'
import { closeAllNutritionSheets, closeNutritionSheet } from './sheet-host'
import { AdjustmentCard, CONFIDENCE_LABEL, SourceBadge } from './nutri-ui'
import { toggleEaten } from './feedback'

export function macrosText(n: Nutrients | undefined): string | undefined {
  if (!n) return undefined
  return `P ${Math.round(n.protein)} · C ${Math.round(n.carbs)} · G ${Math.round(n.fat)} g`
}

function ItemRow({ item, canSwap, onSwap }: { item: BadgedFood; canSwap: boolean; onSwap: (sub: string) => void }) {
  const [open, setOpen] = useState(false)
  const info = plannedFoodInfo(item)
  const subs = item.substitutions ?? []
  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[15px] leading-snug">{item.food}</span>
            {item.badge !== 'nutri' && <SourceBadge source={item.badge} />}
          </div>
          <div className="text-[12px] text-muted mt-0.5">{info.nutrients ? macrosText(info.nutrients) : info.negligible ? 'à vontade' : CONFIDENCE_LABEL.unknown}</div>
        </div>
        {item.qty && <span className="text-[13px] text-muted text-right shrink-0 max-w-[46%] leading-snug">{item.qty}</span>}
      </div>
      {subs.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-0.5 -ml-0.5 inline-flex items-center gap-1 min-h-9 text-[12.5px] text-muted active:text-ink">
            <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
            {open ? 'esconder trocas' : `${subs.length} ${subs.length === 1 ? 'troca' : 'trocas'} do plano`}
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-3 border-l border-line ml-1">
                {subs.map((s) => (
                  <li key={s} className="flex items-center justify-between gap-2 min-h-10">
                    <span className="text-[13px] text-ink-2 leading-snug">{s}</span>
                    {canSwap && (
                      <button type="button" onClick={() => onSwap(s)} className="shrink-0 h-9 px-3 rounded-full bg-ocean-soft text-ocean text-[12.5px] font-medium active:scale-95">
                        usar hoje
                      </button>
                    )}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </li>
  )
}

export default function MealDetailSheet({ date, ref }: { date: DateKey; ref: string }) {
  const db = useDB()
  const { minutes, today } = useNow()
  const nav = useNavigate()
  const nowMin = date === today ? minutes : date < today ? 24 * 60 : 0
  const view = useMemo(() => dayMeals(db, date, nowMin).meals.find((m) => m.ref === ref), [db, date, nowMin, ref])
  const ctx = useMemo(() => dayTrainingContext(db, date), [db, date])

  if (!view) {
    return (
      <SheetLayout title="Refeição" onClose={closeNutritionSheet}>
        <p className="text-muted text-[14px] pb-6">Essa refeição não está mais no plano de hoje.</p>
      </SheetLayout>
    )
  }
  const eaten = view.status === 'consumed'
  const skipped = view.status === 'skipped'
  const training = view.phase && view.phase !== 'refeicao'
  const w = ctx.key ?? ctx.workouts[0]
  const ask = () => {
    const q = `${view.name.toLowerCase()} de ${relativeDay(date, today).toLowerCase()}: posso manter como está?`
    closeAllNutritionSheets()
    nav(`${ROUTES.assistant}?q=${encodeURIComponent(q)}`)
  }
  const swap = (itemIndex: number, sub: string) => {
    const { undo } = saveAdjustment(swapDraft(view, itemIndex, sub, date))
    haptic('light')
    toast('Troca do plano aplicada ✓', { action: { label: 'Desfazer', run: undo } })
  }
  const skip = () => {
    const s = skipMeal(db, date, ref)
    if (!s.draft) return toast(s.summary)
    const { undo } = saveAdjustment(s.draft)
    toast(s.summary, { action: { label: 'Desfazer', run: undo } })
  }

  return (
    <SheetLayout
      eyebrow={[view.plannedTime, `plano “${view.plan.name}”`, relativeDay(date, today)].filter(Boolean).join(' · ')}
      title={view.name}
      onClose={closeNutritionSheet}
      primary={eaten || skipped ? undefined : { label: date === today ? 'Comi agora' : 'Marcar como feita', onClick: () => toggleEaten(date, ref, view.name) }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {eaten ? (
          <span className="inline-flex items-center h-8 px-3 rounded-full bg-sage-soft text-sage text-[13px] font-medium">
            ✓ comi {view.consumedTime ? `às ${view.consumedTime}` : ''}
            {view.plannedTime && view.consumedTime && view.consumedTime !== view.plannedTime ? <span className="text-sage/80 font-normal ml-1">· planejado {view.plannedTime}</span> : null}
          </span>
        ) : skipped ? (
          <span className="inline-flex items-center h-8 px-3 rounded-full bg-surface-2 text-muted text-[13px]">fora hoje</span>
        ) : null}
        <SourceBadge source={view.badge} />
        {eaten && (
          <button type="button" onClick={() => toggleEaten(date, ref, view.name)} className="h-8 px-2 text-[12.5px] text-muted">
            desmarcar
          </button>
        )}
      </div>

      {view.proposed && !eaten && <AdjustmentCard db={db} adj={view.proposed} nowMinutes={nowMin} />}

      {view.adjustment && (
        <div className="rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13px] leading-snug">
          <span className="text-ink-2">Hoje: {view.adjustment.reason}</span>
          {!eaten && (
            <button
              type="button"
              className="block mt-1 h-8 text-[12.5px] font-medium text-accent"
              onClick={() => {
                const undo = dismissAdjustment(view.adjustment!.id)
                toast('De volta ao plano original', { action: { label: 'Desfazer', run: undo } })
              }}
            >
              voltar ao plano original
            </button>
          )}
        </div>
      )}

      {!skipped && (
        <div>
          <ul className="divide-y divide-line/60">
            {view.items.map((it, i) => (
              <ItemRow key={`${it.food}-${i}`} item={it} canSwap={!eaten} onSwap={(s) => swap(i, s)} />
            ))}
          </ul>
          <div className="mt-1 text-[12.5px] text-muted">
            {view.partial ? '≈ ' : ''}
            {macrosText(view.nutrients)}
            {view.partial ? ' · aproximado (alguns itens sem números)' : ' · plano × tabela TACO'}
          </div>
        </div>
      )}

      {view.original.notes && (
        <div className="rounded-2xl bg-sand-soft px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line">
          <span className="eyebrow block mb-0.5">observações do nutri</span>
          {view.original.notes}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={ask} className="h-10 px-4 rounded-full bg-accent-soft text-accent text-[13.5px] font-medium inline-flex items-center gap-1.5 active:scale-[0.97]">
          <MessageCircle size={15} /> perguntar à Lumos
        </button>
        {training && w && !w.id.startsWith('template:') && (
          <button
            type="button"
            onClick={() => {
              closeAllNutritionSheets()
              openSheet('fuel', { workoutId: w.id })
            }}
            className="h-10 px-3 text-[13.5px] text-ink-2"
          >
            estratégia do treino →
          </button>
        )}
        {!eaten && !skipped && (
          <button type="button" onClick={skip} className="h-10 px-3 text-[13.5px] text-muted">
            não vou comer hoje
          </button>
        )}
      </div>
    </SheetLayout>
  )
}
