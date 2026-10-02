/**
 * Contextual pieces of Hoje: the "HOJE" line, energy picker, brain dump entry,
 * "Amanhã é presencial 👜" and the Friday-evening "Fechando a semana ✨".
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { actions } from '@/data/store'
import { agendaFor, checkinFor, modalityOf, workoutsOn } from '@/data/selectors'
import { isPresencial, PERIOD_LABEL } from '@/data/planning'
import type { DateKey, DB } from '@/data/types'
import { addDays } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { ensureCheckin } from '../closing'
import { daySummary, ENERGY_OPTIONS, weekWrap, type Energy } from '../context'
import { morningRoutine } from '../routine'
import { HeaderLink, Widget, type WidgetCtx } from './shared'

// ─── HOJE line ──────────────────────────────────────────────────────────────

export function DaySummaryLine({ db, today }: { db: DB; today: DateKey }) {
  const bits = useMemo(() => daySummary(db, today), [db, today])
  if (!bits.length) return null
  return (
    <div id="w-resumo_dia" className="mt-4">
      <div className="eyebrow">Hoje</div>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {bits.map((b) => (
          <li key={b.key} className="h-8 px-3 rounded-full bg-surface border border-line/70 inline-flex items-center gap-1.5 text-[13.5px] text-ink-2 max-w-full">
            <span aria-hidden>{b.emoji}</span>
            <span className="truncate">{b.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Energy ─────────────────────────────────────────────────────────────────

export function setEnergy(date: DateKey, energy: Energy | undefined): void {
  const c = ensureCheckin(date)
  actions.update('checkins', c.id, { energia: energy })
}

export function EnergyPicker({ db, today }: { db: DB; today: DateKey }) {
  const current = checkinFor(db, today)?.energia
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="text-[12.5px] text-muted mr-0.5">energia</span>
      {ENERGY_OPTIONS.map((o) => {
        const on = current === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => {
              haptic('light')
              setEnergy(today, on ? undefined : o.value)
            }}
            className={cn(
              'h-11 min-w-11 px-2.5 rounded-full inline-flex items-center justify-center gap-1 text-[17px] transition-colors',
              on ? 'bg-ink text-bg' : 'bg-surface/70 border border-line/70',
            )}
          >
            <span aria-hidden>{o.emoji}</span>
            {on && <span className="text-[12.5px] font-medium">{o.label === 'Energia alta' ? 'Alta' : o.label}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function LowEnergyNote() {
  return <p className="mt-2 text-[13px] text-ink-2">Hoje só o essencial aparece. O resto continua guardado.</p>
}

// ─── Brain dump ─────────────────────────────────────────────────────────────

export function BrainDumpWidget({ ctx }: { ctx: WidgetCtx }) {
  const nav = useNavigate()
  const count = useMemo(() => ctx.db.brainDump.filter((b) => b.status === 'inbox').length, [ctx.db.brainDump])
  return (
    <Widget id="brain_dump" eyebrow="Brain dump" action={count > 0 ? <HeaderLink onClick={() => nav(ROUTES.inbox)}>inbox · {count}</HeaderLink> : undefined}>
      <button
        type="button"
        onClick={() => {
          haptic('light')
          openSheet('brainDump')
        }}
        className="w-full flex items-center gap-3 h-[52px] pl-4 pr-3 rounded-full border border-dashed border-line bg-surface-2/50 text-left active:scale-[0.99] transition"
      >
        <Brain size={18} className="text-accent shrink-0" />
        <span className="flex-1 min-w-0 truncate text-[15px] text-ink-2">+ tirar isso da cabeça</span>
      </button>
      <p className="text-[13px] text-muted mt-2.5 px-1">Tá tudo aí. Não precisa ficar na tua cabeça.</p>
    </Widget>
  )
}

// ─── Amanhã ─────────────────────────────────────────────────────────────────

export function AmanhaWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const tomorrow = addDays(today, 1)
  const presencial = isPresencial(db.profile, tomorrow)
  const checklist = db.profile.work?.presencialChecklist ?? []
  const [open, setOpen] = useState(false)
  // Ephemeral on purpose: a light prep aid, not another list to maintain.
  const [checked, setChecked] = useState<Set<number>>(() => new Set())

  const lines = useMemo(() => {
    const out: { key: string; text: string }[] = []
    const w = workoutsOn(db, tomorrow).find((x) => x.status === 'planejado')
    if (w) {
      const m = modalityOf(db, w.modality)
      const when = w.time ?? (w.period ? PERIOD_LABEL[w.period] : undefined)
      out.push({ key: `w-${w.id}`, text: `${m.emoji} ${w.title || m.label}${when ? ` · ${when}` : ''}` })
    }
    for (const e of agendaFor(db, tomorrow).filter((x) => x.kind !== 'workout' && !x.allDay && x.time).slice(0, 2)) {
      out.push({ key: `e-${e.id}`, text: `${e.approx ? '' : `${e.time} · `}${e.title}${e.approx && e.subtitle ? ` (${e.subtitle.split(' · ')[0]})` : ''}` })
    }
    return out
  }, [db, tomorrow])

  if (!presencial && lines.length === 0) return null
  const morning = morningRoutine(db)

  const toggle = (i: number) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i)
    else {
      next.add(i)
      haptic('light')
      if (next.size === checklist.length) toast('Tudo pronto pra amanhã 👜', { tone: 'win' })
    }
    setChecked(next)
  }

  return (
    <section id="w-amanha" className="card scroll-mt-4 p-4" aria-label="Amanhã">
      <div className="eyebrow">Amanhã</div>
      {presencial ? (
        <>
          <div className="font-display text-[20px] leading-snug mt-1">Amanhã é presencial 👜</div>
          <p className="text-[14px] text-ink-2 mt-0.5">Quer preparar as coisas hoje?</p>
        </>
      ) : null}
      {lines.length > 0 && (
        <ul className={cn('space-y-0.5', presencial ? 'mt-2.5' : 'mt-1.5')}>
          {lines.map((l) => (
            <li key={l.key} className="text-[14.5px] text-ink-2 truncate">
              {l.text}
            </li>
          ))}
        </ul>
      )}
      {presencial && checklist.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 -ml-1 h-11 px-1 inline-flex items-center gap-1 text-[13.5px] font-medium text-accent">
            {open ? 'Fechar checklist' : 'Checklist de presencial'}
            {checked.size > 0 && <span className="text-muted font-normal tabular-nums">· {checked.size}/{checklist.length}</span>}
            <ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                {checklist.map((item, i) => {
                  const on = checked.has(i)
                  return (
                    <li key={item}>
                      <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(i)} className="w-full flex items-center gap-3 min-h-[42px] text-left">
                        <span className={cn('h-5 w-5 rounded-md border-[1.5px] shrink-0 flex items-center justify-center text-[11px] text-white transition-colors', on ? 'bg-sage border-sage' : 'border-muted/50')} aria-hidden>
                          {on ? '✓' : ''}
                        </span>
                        <span className={cn('text-[14.5px]', on ? 'text-muted line-through decoration-muted/40' : 'text-ink')}>{item}</span>
                      </button>
                    </li>
                  )
                })}
                <li className="text-[12px] text-muted pt-1 pb-0.5">dá pra editar essa lista em Ajustes</li>
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
      {presencial && morning?.hasEssential && (
        <p className="text-[12.5px] text-muted mt-1.5">Se a manhã ficar corrida, a versão curta da rotina tá ali.</p>
      )}
    </section>
  )
}

// ─── Fechando a semana ✨ (Friday evening) ────────────────────────────────────

export function WeekWrapCard({ db, today }: { db: DB; today: DateKey }) {
  const nav = useNavigate()
  const wrap = useMemo(() => weekWrap(db, today, morningRoutine(db)?.id), [db, today])
  const facts = [
    wrap.tasksDone ? `✓ ${wrap.tasksDone} ${wrap.tasksDone === 1 ? 'coisa feita' : 'coisas feitas'}` : undefined,
    wrap.workoutsDone ? `🏃‍♀️ ${wrap.workoutsDone} ${wrap.workoutsDone === 1 ? 'treino' : 'treinos'}` : undefined,
    wrap.prioritiesDone ? `✨ ${wrap.prioritiesDone} ${wrap.prioritiesDone === 1 ? 'prioridade' : 'prioridades'} do Top 3` : undefined,
    wrap.routineDays ? `☀️ manhã em ${wrap.routineDays} ${wrap.routineDays === 1 ? 'dia' : 'dias'}` : undefined,
  ].filter(Boolean) as string[]
  return (
    <section id="w-semana" className="scroll-mt-4 rounded-[var(--radius-card)] bg-sand-soft p-5" aria-label="Fechando a semana">
      <div className="font-display text-[23px] leading-tight">Fechando a semana ✨</div>
      {facts.length ? (
        <>
          <p className="text-[14px] text-ink-2 mt-1">Olha o que já foi:</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <li key={f} className="h-8 px-3 rounded-full bg-surface/70 inline-flex items-center text-[13.5px]">
                {f}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[14px] text-ink-2 mt-1">Semana vivida. O resto pode esperar até segunda.</p>
      )}
      <button
        type="button"
        onClick={() => nav(ROUTES.weeklyReview)}
        className="mt-4 w-full flex items-center gap-3 rounded-2xl bg-surface/70 px-3.5 min-h-[52px] text-left active:opacity-80"
      >
        <span className="text-[18px]" aria-hidden>
          🗒️
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-medium">Revisão da semana</span>
          <span className="block text-[12.5px] text-muted">quando der — pode ser amanhã, com café</span>
        </span>
        <ChevronRight size={17} className="text-muted" />
      </button>
    </section>
  )
}
