/**
 * "Regras da semana": check-in limits (SchedulingConstraint max_checkins_per_day) and the editable
 * weekly template (WeekTemplateItem). Generic UI — every rule is just data.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, ChevronDown, Minus, Plus, Trash2 } from 'lucide-react'
import { actions, useDB } from '@/data/store'
import type { DayPeriod, SchedulingConstraint, WeekTemplateItem, Weekday } from '@/data/types'
import { PERIOD_LABEL } from '@/data/planning'
import { modalityOf } from '@/data/selectors'
import { removeWithUndo } from '@/app/undo'
import { ChipSelect, Field, IconButton, MultiChipSelect, NumberInput, SectionTitle, TextInput, TimeInput } from '@/components/ui'
import { WEEKDAY_LONG, WEEKDAY_SHORT } from '@/lib/date'
import { cn } from '@/lib/cn'
import { PlanTypeTag, whenLabel } from './components'
import { CHOICE_LABEL, PLAN_TYPE_LABEL, PLAN_TYPES } from './planner'
import { orderedModalities } from './selectors'

const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]
const PERIODS: DayPeriod[] = ['manha', 'almoco', 'tarde', 'noite']
const CHOICES: WeekTemplateItem['choice'][] = ['fixed', 'one_of', 'optional', 'rest']

export default function WeekRules() {
  return (
    <>
      <SectionTitle>Regras da semana</SectionTitle>
      <div className="space-y-3">
        <Collapsible emoji="🗓️" title="Minha semana base" subtitle="o template que vira plano — editável, não é lei">
          <TemplateEditor />
        </Collapsible>
        <Collapsible emoji="🎟️" title="Limites de check-in" subtitle="ex.: um check-in por dia no mesmo serviço">
          <ConstraintsEditor />
        </Collapsible>
      </div>
    </>
  )
}

function Collapsible({ emoji, title, subtitle, children }: { emoji: string; title: string; subtitle: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card overflow-hidden">
      <button type="button" className="w-full flex items-center gap-3 px-4 min-h-[60px] text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-[20px]" aria-hidden>
          {emoji}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px]">{title}</span>
          <span className="block text-[12.5px] text-muted truncate">{subtitle}</span>
        </span>
        <ChevronDown size={18} className={cn('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function useModalityOptions() {
  const modalities = useDB((db) => db.profile.modalities)
  return useMemo(() => orderedModalities(modalities).map((m) => ({ value: m.id, label: `${m.emoji} ${m.label}` })), [modalities])
}

// ─── Check-in limits ────────────────────────────────────────────────────────

function ConstraintsEditor() {
  const all = useDB((db) => db.constraints)
  const list = useMemo(() => all.filter((c) => c.kind === 'max_checkins_per_day'), [all])
  const add = () =>
    actions.create('constraints', { name: 'Novo limite — 1 check-in/dia', kind: 'max_checkins_per_day', limit: 1, modalities: [], active: true })
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] text-muted px-1">Quando treinos dessas modalidades passam do limite no mesmo dia, eu aviso — nunca bloqueio.</p>
      {list.map((c) => (
        <ConstraintRow key={c.id} c={c} />
      ))}
      <button type="button" onClick={add} className="w-full h-12 rounded-2xl border border-dashed border-line text-[14px] text-ink-2 inline-flex items-center justify-center gap-1.5">
        <Plus size={16} /> novo limite
      </button>
    </div>
  )
}

function ConstraintRow({ c }: { c: SchedulingConstraint }) {
  const options = useModalityOptions()
  const patch = (p: Partial<SchedulingConstraint>) => actions.update('constraints', c.id, p)
  return (
    <div className={cn('rounded-2xl bg-surface-2 p-3 space-y-2.5', !c.active && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <input
          aria-label="Nome da regra"
          defaultValue={c.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && patch({ name: e.target.value.trim() })}
          className="flex-1 min-w-0 h-11 rounded-xl bg-surface px-3 outline-none text-[15px]"
        />
        <button
          type="button"
          aria-pressed={c.active}
          onClick={() => patch({ active: !c.active })}
          className={cn('h-9 px-3 rounded-full text-[12.5px] shrink-0', c.active ? 'bg-ink text-bg' : 'bg-surface text-muted')}
        >
          {c.active ? 'ligada' : 'desligada'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-muted flex-1">Check-ins por dia</span>
        <IconButton label="Menos" size="sm" variant="soft" onClick={() => patch({ limit: Math.max(1, c.limit - 1) })}>
          <Minus size={15} />
        </IconButton>
        <span className="font-display text-[20px] w-6 text-center">{c.limit}</span>
        <IconButton label="Mais" size="sm" variant="soft" onClick={() => patch({ limit: c.limit + 1 })}>
          <Plus size={15} />
        </IconButton>
      </div>
      <div>
        <div className="text-[12.5px] text-muted mb-1.5">Modalidades que usam o check-in</div>
        <MultiChipSelect value={c.modalities ?? []} onChange={(modalities) => patch({ modalities })} options={options} />
      </div>
      {c.notes && <p className="text-[12px] text-muted leading-snug">{c.notes}</p>}
      <div className="flex justify-end">
        <button type="button" className="h-9 px-3 text-[12.5px] text-muted inline-flex items-center gap-1" onClick={() => removeWithUndo('constraints', c.id, 'Regra apagada')}>
          <Trash2 size={14} /> apagar regra
        </button>
      </div>
    </div>
  )
}

// ─── Week template ──────────────────────────────────────────────────────────

function TemplateEditor() {
  const template = useDB((db) => db.weekTemplate)
  const [editing, setEditing] = useState<string | null>(null)
  const byDay = useMemo(() => {
    const out = new Map<Weekday, WeekTemplateItem[]>()
    for (const d of WEEK_ORDER) out.set(d, [])
    for (const t of [...template].sort((a, b) => a.order - b.order)) out.get(t.weekday)?.push(t)
    return out
  }, [template])

  const add = (weekday: Weekday) => {
    const lines = byDay.get(weekday) ?? []
    const t = actions.create('weekTemplate', {
      weekday,
      modalities: ['corrida'],
      choice: 'fixed',
      planType: 'base',
      order: lines.reduce((m, x) => Math.max(m, x.order), -1) + 1,
      active: true,
    })
    setEditing(t.id)
  }
  const move = (weekday: Weekday, index: number, dir: -1 | 1) => {
    const lines = byDay.get(weekday) ?? []
    const j = index + dir
    if (j < 0 || j >= lines.length) return
    const next = [...lines]
    ;[next[index], next[j]] = [next[j], next[index]]
    next.forEach((t, i) => t.order !== i && actions.update('weekTemplate', t.id, { order: i }))
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted px-1">Cada linha vira treino (fixo/descanso) ou uma escolha no planner (escolher um / opcional).</p>
      {WEEK_ORDER.map((d) => {
        const lines = byDay.get(d) ?? []
        return (
          <div key={d} className="rounded-2xl bg-surface-2 p-2">
            <div className="flex items-center justify-between pl-1.5">
              <span className="text-[11px] font-semibold tracking-[0.12em] text-muted">{WEEKDAY_SHORT[d]}</span>
              <button type="button" onClick={() => add(d)} className="h-9 px-2.5 text-[12.5px] text-ink-2 inline-flex items-center gap-1">
                <Plus size={14} /> linha
              </button>
            </div>
            <div className="space-y-1.5">
              {lines.map((t, i) => (
                <TemplateLine
                  key={t.id}
                  t={t}
                  open={editing === t.id}
                  onToggle={() => setEditing(editing === t.id ? null : t.id)}
                  onUp={i > 0 ? () => move(d, i, -1) : undefined}
                  onDown={i < lines.length - 1 ? () => move(d, i, 1) : undefined}
                />
              ))}
              {!lines.length && <div className="text-[12.5px] text-muted/80 px-1.5 pb-1.5">sem linha — dia livre</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TemplateLine({ t, open, onToggle, onUp, onDown }: { t: WeekTemplateItem; open: boolean; onToggle: () => void; onUp?: () => void; onDown?: () => void }) {
  const db = useDB()
  const options = useModalityOptions()
  const patch = (p: Partial<WeekTemplateItem>) => actions.update('weekTemplate', t.id, p)
  const mods = t.modalities.map((id) => modalityOf(db, id))
  const summary =
    t.choice === 'rest'
      ? `😴 ${t.title ?? 'descanso'}`
      : t.choice === 'one_of' && mods.length > 3
        ? `${t.title ?? 'escolher'} · ${mods.map((m) => m.emoji).join('')}`
        : mods.map((m) => `${m.emoji} ${m.label.toLowerCase()}`).join(t.choice === 'one_of' ? ' ou ' : ' + ')
  const when = whenLabel(t)

  return (
    <div className={cn('rounded-xl bg-surface', !t.active && 'opacity-60')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-3 py-2.5 min-h-11">
        <div className="flex items-center gap-2">
          <span className="text-[14px] flex-1 min-w-0 truncate">
            {summary}
            {t.choice === 'optional' && <span className="text-muted"> (opcional)</span>}
          </span>
          {when && <span className="text-[12px] text-muted shrink-0">{when}</span>}
          <PlanTypeTag planType={t.planType} />
        </div>
        {t.notes && !open && <div className="text-[12px] text-muted truncate mt-0.5">{t.notes}</div>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 space-y-3 border-t border-line/70 pt-3">
              <Field label="Tipo">
                <ChipSelect value={t.choice} onChange={(choice) => choice && patch({ choice })} options={CHOICES.map((c) => ({ value: c, label: CHOICE_LABEL[c] }))} />
              </Field>
              {t.choice !== 'rest' && (
                <Field label={t.choice === 'one_of' ? 'Opções' : 'Modalidade'}>
                  <MultiChipSelect
                    value={t.modalities}
                    onChange={(modalities) => patch({ modalities: t.choice === 'one_of' ? modalities : modalities.slice(-1) })}
                    options={options}
                  />
                </Field>
              )}
              <Field label="Nome (opcional)">
                <TextInput defaultValue={t.title ?? ''} placeholder={t.choice === 'rest' ? 'Recovery / OFF' : 'ex.: Fun day'} onBlur={(e) => patch({ title: e.target.value.trim() || undefined })} />
              </Field>
              {t.choice !== 'rest' && (
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <Field label="Horário">
                    <TimeInput value={t.time} onChange={(time) => patch({ time, ...(time ? { period: undefined } : {}) })} />
                  </Field>
                  <Field label="Duração">
                    <NumberInput value={t.durationMin} placeholder="min" onChange={(v) => patch({ durationMin: v ? Math.round(v) : undefined })} />
                  </Field>
                </div>
              )}
              {t.choice !== 'rest' && !t.time && (
                <Field label="Período (sem horário exato)">
                  <ChipSelect value={t.period} clearable onChange={(period) => patch({ period })} options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
                </Field>
              )}
              <Field label="Firmeza">
                <ChipSelect value={t.planType} onChange={(planType) => planType && patch({ planType })} options={PLAN_TYPES.map((p) => ({ value: p, label: PLAN_TYPE_LABEL[p].toLowerCase() }))} />
              </Field>
              <Field label="Nota">
                <TextInput defaultValue={t.notes ?? ''} placeholder="ex.: presencial — evitar pedal longo" onBlur={(e) => patch({ notes: e.target.value.trim() || undefined })} />
              </Field>
              <div className="flex items-center gap-1">
                <IconButton label="Subir" size="sm" disabled={!onUp} onClick={onUp} className="disabled:opacity-30">
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton label="Descer" size="sm" disabled={!onDown} onClick={onDown} className="disabled:opacity-30">
                  <ArrowDown size={16} />
                </IconButton>
                <button
                  type="button"
                  onClick={() => patch({ active: !t.active })}
                  className={cn('ml-1 h-9 px-3 rounded-full text-[12.5px]', t.active ? 'bg-ink text-bg' : 'bg-surface-2 text-muted')}
                >
                  {t.active ? 'ligada' : 'pausada'}
                </button>
                <button
                  type="button"
                  className="ml-auto h-9 px-2 text-[12.5px] text-muted inline-flex items-center gap-1"
                  onClick={() => {
                    removeWithUndo('weekTemplate', t.id, `Linha de ${WEEKDAY_LONG[t.weekday]} apagada`)
                  }}
                >
                  <Trash2 size={14} /> apagar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
