/**
 * Lumos's food cards: logging what she ate ("comi um YoPRO"), the proposal for the rest of the day
 * (aplicar · manter plano · outra opção) and answers to food questions. Badges always say where
 * content comes from: NUTRI · TROCA DO PLANO · LUMOS.
 */
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Undo2 } from 'lucide-react'
import { Button, Chip, NumberInput } from '@/components/ui'
import { openSheet, toast } from '@/app/ui-store'
import {
  applyAdjustment,
  dayMeals,
  dismissAdjustment,
  macroPairs,
  nutritionLedger,
  otherOptions,
  parseSubstitution,
  replaceProposal,
  saveAdjustment,
  sameItems,
  shortFood,
  type AdjustmentDraft,
  type BadgedFood,
} from '@/data/nutrition'
import type { DateKey, DB, LoggedFood, MealAdjustment, Nutrients } from '@/data/types'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { normalize } from '@/lib/text'
import { MacroLine, SourceBadge } from '../lumos-ui'
import type { FoodReply } from './answer'
import type { FoodIntent } from './intent'
import { needsAnswer, parseLog, resolveAll, type Resolution, type Savable } from './log'

const CONF: Record<LoggedFood['confidence'], string> = { label: 'rótulo', reference: 'tabela TACO', plan: 'do plano', estimated: 'estimativa', unknown: 'sem números' }

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

function ItemsList({ items }: { items: BadgedFood[] }) {
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-2 text-[13.5px] leading-snug">
          <span className={cn('flex-1 min-w-0 truncate', it.badge === 'nutri' && 'text-ink-2')}>
            {shortFood(it.food)}
            {it.qty && <span className="text-muted"> · {it.qty.replace(/ — .*$/, '')}</span>}
          </span>
          <SourceBadge source={it.badge} />
        </li>
      ))}
    </ul>
  )
}

// ─── Stored proposal (after logging an extra) ───────────────────────────────

function ProposalCard({ db, adj, nowMinutes }: { db: DB; adj: MealAdjustment; nowMinutes: number }) {
  const view = useMemo(() => dayMeals(db, adj.date, nowMinutes).meals.find((m) => m.ref === adj.planMealRef), [db, adj, nowMinutes])
  const others = useMemo(() => otherOptions(db, adj, nowMinutes), [db, adj, nowMinutes])
  const apply = () => {
    const undo = applyAdjustment(adj.id)
    haptic('success')
    toast('Aplicado só pra hoje ✓', { action: { label: 'Desfazer', run: undo } })
  }
  const keep = () => {
    const undo = dismissAdjustment(adj.id)
    toast('Mantive o plano do nutri ✓', { action: { label: 'Desfazer', run: undo } })
  }
  const next = () => {
    const i = others.findIndex((o) => sameItems(o, adj))
    const o = others[(i + 1) % others.length]
    if (o) replaceProposal(adj.id, o)
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[14.5px] font-medium">
          {view?.name ?? 'Refeição'}
          {view?.plannedTime && <span className="text-muted font-normal"> · {view.plannedTime}</span>}
        </div>
        <SourceBadge source={adj.kind === 'trocar' ? 'troca' : 'lumos'} />
      </div>
      <p className="text-[13px] text-ink-2 leading-snug">{adj.reason}</p>
      <ItemsList items={adj.items} />
      {adj.status === 'proposed' ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Button size="sm" onClick={apply}>
            Aplicar
          </Button>
          <Button size="sm" variant="soft" onClick={keep}>
            Manter plano
          </Button>
          {others.length > 1 && (
            <Button size="sm" variant="ghost" onClick={next}>
              Outra opção
            </Button>
          )}
        </div>
      ) : (
        <p className="text-[12.5px] text-muted">{adj.status === 'applied' ? 'Aplicado só pra hoje ✓' : 'Mantido como o nutri prescreveu ✓'}</p>
      )}
    </div>
  )
}

// ─── Draft (from a question; not stored until "aplicar") ────────────────────

function DraftCard({ draft, mealName, time }: { draft: AdjustmentDraft; mealName: string; time?: string }) {
  const [state, setState] = useState<{ status: 'open' | 'applied' | 'kept'; undo?: () => void }>({ status: 'open' })
  const apply = () => {
    const { undo } = saveAdjustment({ ...draft, status: 'applied' })
    haptic('success')
    setState({ status: 'applied', undo })
    toast('Aplicado só nesse dia ✓', { action: { label: 'Desfazer', run: () => (undo(), setState({ status: 'open' })) } })
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[14.5px] font-medium">
          {mealName}
          {time && <span className="text-muted font-normal"> · {time}</span>}
        </div>
        <SourceBadge source={draft.kind === 'trocar' ? 'troca' : 'lumos'} />
      </div>
      <p className="text-[13px] text-ink-2 leading-snug">{draft.reason}</p>
      <ItemsList items={draft.items} />
      {state.status === 'open' && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Button size="sm" onClick={apply}>
            Aplicar
          </Button>
          <Button size="sm" variant="soft" onClick={() => setState({ status: 'kept' })}>
            Manter plano
          </Button>
        </div>
      )}
      {state.status === 'applied' && (
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-muted">Aplicado ✓</span>
          <Chip onClick={() => (state.undo?.(), setState({ status: 'open' }))}>
            <Undo2 size={14} aria-hidden />
            Desfazer
          </Chip>
        </div>
      )}
      {state.status === 'kept' && <p className="text-[12.5px] text-muted">Mantido como o nutri prescreveu ✓</p>}
    </div>
  )
}

// ─── Logging ────────────────────────────────────────────────────────────────

export interface FoodLogState {
  status: 'resolving' | 'logged' | 'undone'
  mealId?: string
  adjustmentIds?: string[]
  summary?: string
  autoApplied?: boolean
  foods?: LoggedFood[]
  savable?: Savable[]
  undo?: () => void
}

function LabelBox({ value, onChange }: { value?: Nutrients; onChange: (n: Nutrients) => void }) {
  const v = value ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const set = (k: keyof Nutrients) => (n: number | undefined) => {
    const next = { ...v, [k]: n ?? 0 }
    if (k !== 'kcal') next.kcal = Math.round(next.protein * 4 + next.carbs * 4 + next.fat * 9)
    onChange(next)
  }
  return (
    <div className="mt-2 rounded-2xl bg-surface-2 p-3">
      <div className="text-[12.5px] text-ink-2 mb-2">Números do rótulo, por unidade (g):</div>
      <div className="grid grid-cols-3 gap-2">
        {(['protein', 'carbs', 'fat'] as const).map((k) => (
          <label key={k} className="text-[11.5px] text-muted">
            {k === 'protein' ? 'Proteína' : k === 'carbs' ? 'Carbo' : 'Gordura'}
            <NumberInput value={v[k] || undefined} onChange={set(k)} inputMode="decimal" className="mt-1 h-10" />
          </label>
        ))}
      </div>
    </div>
  )
}

export function FoodLogCard({
  db,
  date,
  nowMinutes,
  intent,
  state,
  onLog,
  onUndo,
}: {
  db: DB
  date: DateKey
  nowMinutes: number
  intent: Extract<FoodIntent, { kind: 'log' }>
  state: FoodLogState
  onLog: (foods: LoggedFood[], savable: Savable[]) => void
  onUndo: () => void
}) {
  const parsed = useMemo(() => parseLog(db, intent.text), [db, intent.text])
  const [res, setRes] = useState<Record<string, Resolution>>({})
  const ledger = useMemo(() => nutritionLedger(db, date, nowMinutes), [db, date, nowMinutes])
  const adjustments = useMemo(() => db.mealAdjustments.filter((a) => state.adjustmentIds?.includes(a.id)), [db.mealAdjustments, state.adjustmentIds])

  if (state.status === 'resolving' && needsAnswer(parsed)) {
    return (
      <Shell eyebrow="✨ Lumos · comida" title={parsed.needsChoice[0]?.question ?? 'Esse eu não conheço ainda — anoto sem números?'}>
        <div className="space-y-2.5">
          {parsed.items.map((p) => (
            <div key={p.phrase} className="flex items-center gap-2 text-[14px]">
              <span aria-hidden>{p.emoji ?? '🍽️'}</span>
              <span className="flex-1">{p.name}</span>
              <span className="text-[11.5px] text-muted">{CONF[p.nutrients ? p.confidence : 'unknown']}</span>
            </div>
          ))}
          {parsed.needsChoice.map((c, ci) => {
            const r = res[c.phrase] ?? {}
            return (
              <div key={c.phrase} className="rounded-2xl bg-sand-soft/60 px-3.5 py-3">
                {ci > 0 && <div className="text-[14px] font-medium mb-2">{c.question}</div>}
                <div className="flex flex-wrap gap-2">
                  {c.options.map((o, i) => (
                    <Chip key={i} selected={r.option?.kind === o.kind && (o.kind !== 'meu' || (r.option as typeof o).foodId === o.foodId)} onClick={() => setRes((s) => ({ ...s, [c.phrase]: { ...r, option: o } }))}>
                      {o.label}
                    </Chip>
                  ))}
                </div>
                {r.option?.kind === 'estimativa' && <p className="text-[12.5px] text-ink-2 mt-2">Vou considerar como estimativa.</p>}
                {r.option?.kind === 'rotulo' && <LabelBox value={r.label} onChange={(label) => setRes((s) => ({ ...s, [c.phrase]: { ...r, label } }))} />}
              </div>
            )
          })}
          {parsed.unknown.map((u) => (
            <div key={u} className="rounded-2xl border border-dashed border-line px-3.5 py-2.5 text-[13.5px] text-ink-2">
              “{u}” — não conheço ainda, anoto sem números
            </div>
          ))}
        </div>
        <Button size="sm" onClick={() => {
          const r = resolveAll(db, parsed, res)
          onLog(r.foods, r.savable)
        }}>
          Registrar agora
        </Button>
      </Shell>
    )
  }

  if (state.status === 'undone') return <Shell eyebrow="✨ Lumos · comida" title="Desfeito — tirei esse registro." />
  if (state.status !== 'logged') return null

  const proposals = adjustments.filter((a) => a.status !== 'dismissed' || state.adjustmentIds?.length)
  const open = adjustments.length > 0
  return (
    <Shell eyebrow="✨ Lumos · comida" title={state.summary ?? 'Registrado ✓'}>
      {!!state.foods?.length && (
        <ul className="space-y-1">
          {state.foods.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-[13.5px]">
              <span className="flex-1 min-w-0 truncate">
                {f.name}
                {f.nutrients && <span className="text-muted"> · P {Math.round(f.nutrients.protein)} · C {Math.round(f.nutrients.carbs)} · G {Math.round(f.nutrients.fat)}</span>}
              </span>
              <span className={cn('text-[11.5px] shrink-0', f.confidence === 'estimated' ? 'text-sand' : 'text-muted')}>{CONF[f.nutrients ? f.confidence : 'unknown']}</span>
            </li>
          ))}
        </ul>
      )}
      {ledger.plan && <MacroLine macros={macroPairs(ledger)} partial={ledger.partial} />}
      {open && (
        <section className="space-y-2">
          <div className="text-[13px] font-semibold text-ink-2 px-0.5">{state.autoApplied ? 'Atualizei o restante do seu dia' : 'Pro restante do dia, se quiser:'}</div>
          {proposals.map((a) => (
            <ProposalCard key={a.id} db={db} adj={a} nowMinutes={nowMinutes} />
          ))}
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <Chip onClick={onUndo}>
          <Undo2 size={14} aria-hidden />
          Desfazer
        </Chip>
        {state.savable
          ?.filter((s) => !db.foods.some((f) => f.mine && normalize(f.name) === normalize(s.name)))
          .map((s) => (
            <Chip
              key={s.name}
              onClick={() =>
                openSheet('myFood', {
                  defaults: {
                    name: s.name,
                    emoji: s.emoji,
                    serving: { label: s.unitLabel ?? '1 unidade' },
                    ...(s.nutrients ? { nutrients: s.nutrients, confidence: s.confidence } : {}),
                  },
                })
              }
            >
              Salvar “{s.name}” em Meus alimentos
            </Chip>
          ))}
      </div>
    </Shell>
  )
}

// ─── Answers ────────────────────────────────────────────────────────────────

export function FoodAnswerCard({ reply, onUndoSkip, skipUndone }: { reply: FoodReply; onUndoSkip?: () => void; skipUndone?: boolean }) {
  const [swapped, setSwapped] = useState<{ key: string; undo: () => void } | undefined>()
  return (
    <Shell eyebrow="✨ Lumos · comida" title={skipUndone ? 'Desfeito — a refeição voltou pro dia.' : reply.headline}>
      {reply.lines.map((l) => (
        <p key={l} className="text-[13.5px] text-ink-2 leading-snug -mt-1.5">
          {l}
        </p>
      ))}
      {reply.macros && <MacroLine macros={reply.macros} partial={reply.partial} />}
      {reply.drafts?.map((d) => <DraftCard key={d.draft.planMealRef + d.draft.kind} draft={d.draft} mealName={d.mealName} time={d.time} />)}
      {!!reply.fits?.length && (
        <ul className="rounded-2xl border border-line bg-surface divide-y divide-line/70 overflow-hidden">
          {reply.fits.map((f, i) => (
            <li key={i} className="px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-[14px] truncate">
                  {shortFood(f.food)}
                  {f.qty && <span className="text-muted"> · {f.qty}</span>}
                </span>
                <SourceBadge source={f.badge} />
              </div>
              <div className="text-[12px] text-muted leading-snug mt-0.5">{f.note}</div>
            </li>
          ))}
        </ul>
      )}
      {reply.swaps && <SwapList reply={reply} swapped={swapped} setSwapped={setSwapped} />}
      {reply.skip && !skipUndone && onUndoSkip && (
        <Chip onClick={onUndoSkip}>
          <Undo2 size={14} aria-hidden />
          Desfazer
        </Chip>
      )}
    </Shell>
  )
}

function SwapList({ reply, swapped, setSwapped }: { reply: FoodReply; swapped?: { key: string; undo: () => void }; setSwapped: (s: { key: string; undo: () => void } | undefined) => void }) {
  const choose = (ref: string, itemIndex: number, sub: string, items: BadgedFood[]) => {
    swapped?.undo()
    const next = items.map((it, i) => (i === itemIndex ? { ...parseSubstitution(sub), badge: 'troca' as const } : it))
    const { undo } = saveAdjustment({ date: reply.date, planMealRef: ref, kind: 'trocar', items: next, reason: `Troca do plano: ${shortFood(items[itemIndex].food)} → ${shortFood(subItem(sub).food)}.`, status: 'applied', by: 'marina' })
    haptic('success')
    setSwapped({ key: `${ref}#${itemIndex}#${sub}`, undo })
    toast('Troca do plano aplicada só nesse dia ✓', { action: { label: 'Desfazer', run: () => (undo(), setSwapped(undefined)) } })
  }
  return (
    <div className="space-y-2.5">
      {reply.swaps!.map((s) => (
        <div key={`${s.ref}#${s.itemIndex}`} className="rounded-2xl border border-line bg-surface p-3.5">
          <div className="flex items-center gap-2 text-[14px]">
            <span className="flex-1 min-w-0">
              {shortFood(s.food)}
              {s.qty && <span className="text-muted"> · {s.qty}</span>}
            </span>
            <SourceBadge source="nutri" />
          </div>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {s.subs.slice(0, 6).map((sub) => {
              const key = `${s.ref}#${s.itemIndex}#${sub}`
              const label = subItem(sub)
              return (
                <Chip key={sub} selected={swapped?.key === key} onClick={() => (swapped?.key === key ? (swapped.undo(), setSwapped(undefined)) : choose(s.ref, s.itemIndex, sub, s.items))} className="h-auto min-h-9 py-1.5 text-left">
                  {shortFood(label.food)}
                  {label.qty && <span className="text-muted text-[12px]"> {label.qty}</span>}
                </Chip>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** "Arroz integral cozido - 5 colheres (125g)" → { food, qty }. */
function subItem(sub: string): { food: string; qty?: string } {
  const i = sub.indexOf(' - ')
  return i < 0 ? { food: sub } : { food: sub.slice(0, i), qty: sub.slice(i + 3) }
}
