import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown, Copy, Plus } from 'lucide-react'
import { useDB } from '@/data/store'
import type { DateKey, NutritionDayPlan } from '@/data/types'
import { openSheet, toast } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { Button, Card, EmptyState, IconButton, ListCard, ListRow, Page, PageHeader, SectionTitle } from '@/components/ui'
import { DAY_TYPE_LABEL } from '@/data/fuel'
import { useToday } from '@/hooks/useToday'
import { formatDayMonth, relativeDay, WEEKDAY_LONG, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import { PlannedMealBlock, SourceNote } from './components'
import { durationRange, SOURCE_LABEL, sourceLine, workoutEmoji, workoutTitle } from './format'
import { weekRows } from './logic'
import { buildNutritionReport } from './report'

type Selection = { kind: 'day'; date: DateKey } | { kind: 'plan'; id: string }

export default function NutritionPage() {
  const db = useDB()
  const today = useToday()
  const nav = useNavigate()
  const [sel, setSel] = useState<Selection>({ kind: 'day', date: today })
  const rows = useMemo(() => weekRows(db, today), [db, today])
  const plans = useMemo(() => [...db.nutritionDayPlans].filter((p) => p.active).sort((a, b) => order(a) - order(b)), [db.nutritionDayPlans])
  const strategies = db.nutritionStrategies
  const notes = useMemo(() => strategies.filter((s) => s.notes?.trim()).map((s) => ({ id: s.id, title: s.name, text: s.notes! })), [strategies])

  const selectedRow = sel.kind === 'day' ? rows.find((r) => r.date === sel.date) : undefined
  const shownPlan = sel.kind === 'plan' ? plans.find((p) => p.id === sel.id) : selectedRow?.plan

  return (
    <Page>
      <PageHeader eyebrow="corpo · alimentação" title="Estratégia Nutricional" subtitle="O plano do nutri, organizado pelos seus treinos." back />

      {/* Week view */}
      <SectionTitle>essa semana</SectionTitle>
      <ListCard>
        {rows.map((r) => {
          const active = sel.kind === 'day' && sel.date === r.date
          return (
            <button
              key={r.date}
              type="button"
              onClick={() => setSel({ kind: 'day', date: r.date })}
              className={cn('w-full flex items-center gap-3 min-h-[50px] px-4 py-2.5 text-left transition-colors', active ? 'bg-surface-2' : 'active:bg-surface-2')}
            >
              <span className={cn('w-9 shrink-0 text-[12px] font-semibold tracking-[0.08em]', r.date === today ? 'text-accent' : 'text-muted')}>{r.short}</span>
              <span className="flex-1 min-w-0 text-[15px] leading-snug">
                {r.key && <span className="mr-1">🔥</span>}
                {r.label || <span className="text-muted">livre</span>}
              </span>
              {r.plan && <span className="text-[11.5px] text-muted shrink-0">plano</span>}
            </button>
          )
        })}
      </ListCard>

      {/* Selected day / plan */}
      <motion.div key={sel.kind === 'day' ? sel.date : sel.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow">
                {sel.kind === 'day' ? `${relativeDay(sel.date, today)} · ${formatDayMonth(sel.date)}` : 'plano prescrito'}
              </div>
              <div className="font-display text-[22px] leading-tight mt-0.5">
                {sel.kind === 'day' ? WEEKDAY_LONG[weekday(sel.date)] : shownPlan?.name}
              </div>
              {selectedRow && <div className="text-[13px] text-muted mt-0.5">{DAY_TYPE_LABEL[selectedRow.ctx.dayType]}</div>}
            </div>
          </div>

          {selectedRow && selectedRow.ctx.workouts.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedRow.ctx.workouts.map((w) => (
                <div key={w.id} className="rounded-2xl bg-surface-2 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xl" aria-hidden>
                      {workoutEmoji(db.profile, w)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] leading-snug">
                        {workoutTitle(db.profile, w)}
                        {w.isKeySession && ' 🔥'}
                      </div>
                      <div className="text-[12px] text-muted">{[w.time, durationRange(w)].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 pl-9">
                    <Button size="sm" variant="outline" onClick={() => openSheet('fuel', { workoutId: w.id })}>
                      Estratégia
                    </Button>
                    {w.isKeySession && w.date <= today && (
                      <Button size="sm" variant="ghost" onClick={() => openSheet('postWorkoutCheckin', { workoutId: w.id })}>
                        Como foi?
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {selectedRow.ctx.prepFor && (
                <p className="text-[13px] text-ink-2 px-1">
                  Amanhã tem {workoutTitle(db.profile, selectedRow.ctx.prepFor).toLowerCase()} — hoje é dia de preparação.
                </p>
              )}
            </div>
          )}

          <div className="mt-2 divide-y divide-line/70">
            {shownPlan ? (
              shownPlan.meals.map((m, i) => <PlannedMealBlock key={`${m.time}-${i}`} meal={m} />)
            ) : (
              <p className="text-[14px] text-muted py-4">Sem plano cadastrado para esse tipo de dia.</p>
            )}
          </div>
          {shownPlan && (
            <SourceNote>
              {sourceLine(shownPlan.source, shownPlan.prescribedAt)}
              {shownPlan.sourceName ? ` · ${shownPlan.sourceName}` : ''}
              {shownPlan.notes ? ` · ${shownPlan.notes}` : ''}
            </SourceNote>
          )}
        </Card>
      </motion.div>

      {plans.length > 0 && (
        <div className="mt-3">
          <div className="eyebrow px-1 mb-2">planos prescritos</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSel({ kind: 'plan', id: p.id })}
                className={cn(
                  'shrink-0 h-9 px-3.5 rounded-full text-[13.5px] border transition',
                  sel.kind === 'plan' && sel.id === p.id ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2',
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Strategies */}
      <SectionTitle
        action={
          <IconButton size="sm" label="Nova estratégia" onClick={() => openSheet('nutritionStrategy', {})}>
            <Plus size={18} />
          </IconButton>
        }
      >
        estratégias por treino
      </SectionTitle>
      {strategies.length === 0 ? (
        <Card>
          <EmptyState compact emoji="🍽️" title="Nenhuma estratégia ainda" text="Registre o que você ou o nutri combinaram pra cada tipo de treino." />
        </Card>
      ) : (
        <ListCard>
          {strategies.map((s) => (
            <ListRow
              key={s.id}
              title={s.name}
              subtitle={[s.timing, `${SOURCE_LABEL[s.source]}${s.sourceName ? ` · ${s.sourceName.split(' — ')[0]}` : ''}`].filter(Boolean).join(' · ')}
              chevron
              onPress={() => openSheet('nutritionStrategy', { id: s.id })}
            />
          ))}
        </ListCard>
      )}

      {/* Notes */}
      <SectionTitle>notas do nutri</SectionTitle>
      {notes.length === 0 ? (
        <p className="text-[13.5px] text-muted px-1">Quando o nutri deixar um recado numa estratégia, ele aparece aqui.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <Card key={n.id}>
              <div className="eyebrow mb-1">{n.title}</div>
              <p className="text-[14px] leading-relaxed whitespace-pre-line">{n.text}</p>
            </Card>
          ))}
        </div>
      )}

      <ReportCard />

      <SectionTitle>corpo</SectionTitle>
      <ListCard>
        <ListRow leading={<span className="text-xl">🌿</span>} title="Evolução" subtitle="composição corporal — referência, não placar" chevron onPress={() => nav(ROUTES.bodyEvolution)} />
      </ListCard>
    </Page>
  )
}

const WD_ORDER = [7, 1, 2, 3, 4, 5, 6]
function order(p: NutritionDayPlan): number {
  return Math.min(...p.weekdays.map((d) => WD_ORDER[d]), 99)
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall back below */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function ReportCard() {
  const db = useDB()
  const today = useToday()
  const [open, setOpen] = useState(false)
  const text = useMemo(() => (open ? buildNutritionReport(db, today) : ''), [db, today, open])
  return (
    <>
      <SectionTitle>resumo para o nutricionista</SectionTitle>
      <Card>
        <p className="text-[14px] text-ink-2 leading-relaxed">
          Últimas 4 semanas: treinos principais, duração, como foi, o que você marcou de pré/intra/pós e refeições ligadas a treino. Só fatos — sem diagnóstico.
        </p>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="primary"
            icon={<Copy size={15} />}
            onClick={async () => {
              const ok = await copyText(buildNutritionReport(db, today))
              toast(ok ? 'Resumo copiado ✓' : 'Não consegui copiar — abra e selecione o texto')
              if (!ok) setOpen(true)
            }}
          >
            Copiar resumo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} icon={<ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} />}>
            {open ? 'Esconder' : 'Ver texto'}
          </Button>
        </div>
        {open && <textarea readOnly value={text} rows={14} className="input mt-3 text-[12.5px] leading-relaxed font-mono" onFocus={(e) => e.currentTarget.select()} />}
      </Card>
    </>
  )
}
