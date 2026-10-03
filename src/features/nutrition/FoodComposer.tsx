/**
 * "Registrar outra coisa" — the smart composer. Type it like you'd say it; the engine interprets,
 * asks only when it can't be honest ("Qual brownie?"), records the real time and re-evaluates the
 * rest of the day. Meus alimentos are one tap.
 */
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { useDB } from '@/data/store'
import { closeSheet } from '@/app/ui-store'
import { ChipSelect, Field, MoreOptions, SheetLayout, TimeInput, TitleInput, DateInput } from '@/components/ui'
import type { DateKey, LoggedFood, MealSlot, Nutrients } from '@/data/types'
import { dayPlanFor } from '@/data/fuel'
import { formatQty, fromMyFood, parseFoodText, resolveChoice, saveMyFood, slotForPlannedMeal, toLoggedFood, unknownFood, type ChoiceOption, type ParsedFood } from '@/data/nutrition'
import { useNow } from '@/hooks/useToday'
import { relativeDay, toInstant, toTimeHM, todayKey } from '@/lib/date'
import { normalize } from '@/lib/text'
import { cn } from '@/lib/cn'
import { CONFIDENCE_LABEL } from './nutri-ui'
import { LabelNumbers } from './MyFoodSheet'
import { logAndAnnounce } from './feedback'

const EXAMPLES = ['1 YoPRO', 'banana com duas fatias de queijo', 'um brownie', 'café com leite', 'comi japonês']

const SLOT_OPTIONS: { value: MealSlot; label: string }[] = [
  { value: 'extra', label: 'extra' },
  { value: 'cafe', label: 'café' },
  { value: 'lanche_manha', label: 'lanche manhã' },
  { value: 'almoco', label: 'almoço' },
  { value: 'lanche_tarde', label: 'lanche tarde' },
  { value: 'jantar', label: 'jantar' },
]

type Label = Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat', number>>
interface Resolution {
  option?: ChoiceOption
  label?: Label
  save: boolean
}

const hasLabel = (l?: Label) => !!l && (l.protein != null || l.carbs != null || l.fat != null || l.kcal != null)
const toNutrients = (l: Label): Nutrients => {
  const p = l.protein ?? 0
  const c = l.carbs ?? 0
  const f = l.fat ?? 0
  return { kcal: l.kcal ?? Math.round(p * 4 + c * 4 + f * 9), protein: p, carbs: c, fat: f }
}

function ConfidenceTag({ p }: { p: ParsedFood }) {
  const c = p.nutrients ? p.confidence : 'unknown'
  return <span className={cn('text-[11.5px] shrink-0', c === 'estimated' ? 'text-sand' : c === 'unknown' ? 'text-muted' : 'text-sage')}>{CONFIDENCE_LABEL[c]}</span>
}

function LabelBox({ res, onChange, saveLabel }: { res: Resolution; onChange: (r: Resolution) => void; saveLabel: string }) {
  return (
    <div className="mt-2 rounded-2xl bg-surface-2 p-3 space-y-2.5">
      <div className="text-[12.5px] text-ink-2">Números do rótulo, por unidade:</div>
      <LabelNumbers value={res.label ?? {}} onChange={(label) => onChange({ ...res, label })} />
      <button type="button" aria-pressed={res.save} onClick={() => onChange({ ...res, save: !res.save })} className="h-9 text-[13px] text-ink-2 inline-flex items-center gap-2">
        <span className={cn('h-5 w-5 rounded-md border flex items-center justify-center text-[12px]', res.save ? 'bg-ink border-ink text-bg' : 'border-line')}>{res.save ? '✓' : ''}</span>
        {saveLabel}
      </button>
    </div>
  )
}

export function FoodComposer({ date: initialDate, slot: initialSlot }: { date?: DateKey; slot?: MealSlot }) {
  const db = useDB()
  const { today, now } = useNow()
  const [text, setText] = useState('')
  const [date, setDate] = useState<DateKey>(initialDate ?? today)
  const [time, setTime] = useState<string | undefined>(undefined)
  const hasPlan = useMemo(() => !!dayPlanFor(db, date), [db, date])
  const [slot, setSlot] = useState<MealSlot | undefined>(initialSlot)
  const [res, setRes] = useState<Record<string, Resolution>>({})
  const parsed = useMemo(() => parseFoodText(db, text), [db, text])
  const mine = useMemo(() => [...db.foods].filter((f) => f.mine).sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0)).slice(0, 8), [db.foods])
  const r = (k: string): Resolution => res[k] ?? { save: true }
  const setR = (k: string, v: Resolution) => setRes((s) => ({ ...s, [k]: v }))

  const when = (): Date => (time ? toInstant(date, time) : date === todayKey(now) ? new Date() : toInstant(date, '12:00'))
  const finalSlot: MealSlot = slot ?? (hasPlan ? 'extra' : slotForPlannedMeal({ time: time ?? toTimeHM(now) }))

  const quickLog = (foodId: string) => {
    const f = db.foods.find((x) => x.id === foodId)
    if (!f) return
    closeSheet()
    logAndAnnounce({ date, foods: [toLoggedFood(fromMyFood(f, 1, undefined, f.name))], now: when(), slot: finalSlot, via: 'botao', noAdapt: date !== today })
  }

  const withLabel = (p: ParsedFood, key: string, typed: string): LoggedFood => {
    const rr = r(key)
    if (!hasLabel(rr.label)) return toLoggedFood(p)
    const nutrients = toNutrients(rr.label!)
    if (rr.save) {
      const { food } = saveMyFood({ name: typed, serving: { label: p.unitLabel && p.qty === 1 ? p.unitLabel : '1 unidade' }, nutrients, confidence: 'label', aliases: [normalize(typed)], sourceNote: 'rótulo', emoji: p.emoji })
      return toLoggedFood({ ...fromMyFood(food, p.qty, undefined, p.phrase) })
    }
    return { name: typed, qty: p.qty, nutrients: { ...nutrients, kcal: nutrients.kcal * p.qty, protein: nutrients.protein * p.qty, carbs: nutrients.carbs * p.qty, fat: nutrients.fat * p.qty }, confidence: 'label' }
  }

  const save = () => {
    if (!text.trim()) return
    const foods: LoggedFood[] = []
    for (const p of parsed.items) foods.push(withLabel(p, p.phrase, p.name))
    for (const c of parsed.needsChoice) {
      const rr = r(c.phrase)
      if (rr.option?.kind === 'rotulo') {
        foods.push(withLabel(resolveChoice(db, c, { kind: 'sem_numeros', label: '' }), c.phrase, c.typed))
      } else foods.push(toLoggedFood(resolveChoice(db, c, rr.option ?? { kind: 'sem_numeros', label: '' })))
    }
    for (const u of parsed.unknown) foods.push(withLabel(unknownFood(u), u, unknownFood(u).name))
    closeSheet()
    logAndAnnounce({ date, foods, description: text.trim(), now: when(), slot: finalSlot, via: 'formulario', noAdapt: date !== today })
  }

  const empty = !text.trim()
  return (
    <SheetLayout eyebrow={relativeDay(date, today)} title="Registrar" onClose={closeSheet} primary={{ label: 'Registrar', onClick: save, disabled: empty }}>
      <TitleInput autoFocus placeholder="o que você comeu?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && parsed.needsChoice.length === 0 && save()} />

      {empty && (
        <>
          {mine.length > 0 && (
            <div>
              <div className="eyebrow mb-2">meus alimentos · 1 toque</div>
              <div className="flex flex-wrap gap-2">
                {mine.map((f) => (
                  <button key={f.id} type="button" onClick={() => quickLog(f.id)} className="h-10 px-3.5 rounded-full bg-sage-soft text-ink text-[13.5px] inline-flex items-center gap-1.5 active:scale-[0.97] transition">
                    {f.emoji && <span aria-hidden>{f.emoji}</span>}
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="eyebrow mb-2">por exemplo</div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setText(ex)} className="h-9 px-3 rounded-full border border-line text-[13px] text-ink-2 active:bg-surface-2">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {!empty && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5">
          {parsed.items.map((p) => (
            <div key={p.phrase} className="rounded-2xl border border-line/80 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="text-[18px] w-6 text-center" aria-hidden>
                  {p.emoji ?? '🍽️'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] leading-snug">{p.name}</div>
                  <div className="text-[12px] text-muted">
                    {[p.qty !== 1 ? `${formatQty(p.qty)} × ${p.unitLabel ?? 'porção'}` : p.unitLabel ? `1 ${p.unitLabel}` : undefined, p.grams ? `${p.grams} g` : undefined, p.nutrients ? `P ${Math.round(p.nutrients.protein)} · C ${Math.round(p.nutrients.carbs)} · G ${Math.round(p.nutrients.fat)}` : undefined]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <ConfidenceTag p={p} />
              </div>
              {p.confidence === 'estimated' && <div className="text-[12px] text-sand mt-1 pl-8">porção estimada — vou considerar como estimativa</div>}
              {p.canUseLabel && !hasLabel(r(p.phrase).label) && !r(p.phrase).option && (
                <button type="button" onClick={() => setR(p.phrase, { ...r(p.phrase), option: { kind: 'rotulo', label: '' } })} className="mt-1 ml-8 h-8 text-[12.5px] text-accent font-medium">
                  usar rótulo
                </button>
              )}
              {p.canUseLabel && r(p.phrase).option?.kind === 'rotulo' && <LabelBox res={r(p.phrase)} onChange={(v) => setR(p.phrase, v)} saveLabel="salvar em Meus alimentos" />}
            </div>
          ))}

          {parsed.needsChoice.map((c) => {
            const rr = r(c.phrase)
            return (
              <div key={c.phrase} className="rounded-2xl bg-sand-soft/60 px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[18px]" aria-hidden>
                    {c.emoji ?? '🤔'}
                  </span>
                  <span className="text-[14.5px] font-medium">{c.question}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {c.options.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={rr.option === o || (rr.option?.kind === o.kind && (o.kind !== 'meu' || (rr.option as typeof o).foodId === o.foodId))}
                      onClick={() => setR(c.phrase, { ...rr, option: o })}
                      className={cn(
                        'h-9 px-3.5 rounded-full text-[13px] border transition',
                        rr.option?.kind === o.kind && (o.kind !== 'meu' || (rr.option as typeof o).foodId === o.foodId) ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2',
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {rr.option?.kind === 'estimativa' && <p className="text-[12.5px] text-ink-2 mt-2">Vou considerar como estimativa — sem fingir precisão.</p>}
                {rr.option?.kind === 'rotulo' && <LabelBox res={rr} onChange={(v) => setR(c.phrase, v)} saveLabel={`salvar “${c.typed}” em Meus alimentos`} />}
                {!rr.option && <p className="text-[12px] text-muted mt-2">Sem escolha, anoto sem números.</p>}
              </div>
            )
          })}

          {parsed.unknown.map((u) => {
            const rr = r(u)
            return (
              <div key={u} className="rounded-2xl border border-dashed border-line px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] text-ink-2">“{u}”</span>
                  <span className="text-[11.5px] text-muted">não conheço ainda</span>
                </div>
                {rr.option?.kind === 'rotulo' ? (
                  <LabelBox res={rr} onChange={(v) => setR(u, v)} saveLabel="salvar em Meus alimentos" />
                ) : (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[12.5px] text-muted">anoto sem números ·</span>
                    <button type="button" onClick={() => setR(u, { ...rr, option: { kind: 'rotulo', label: '' } })} className="h-8 text-[12.5px] text-accent font-medium">
                      usar rótulo
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </motion.div>
      )}

      <div className="flex items-center gap-2 text-[13px] text-muted px-0.5">
        <Clock size={14} />
        {time ? `às ${time}` : date === today ? 'agora — o horário real fica registrado' : relativeDay(date, today)}
      </div>

      <MoreOptions>
        <Field label="Horário">
          <TimeInput value={time} onChange={setTime} />
        </Field>
        <Field label="Dia">
          <DateInput value={date} onChange={(v) => v && setDate(v)} />
        </Field>
        <Field label="Momento">
          <ChipSelect value={finalSlot} onChange={(v) => setSlot(v)} options={SLOT_OPTIONS} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
