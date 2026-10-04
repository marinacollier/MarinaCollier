import { motion } from 'framer-motion'
import { AlertTriangle, ArrowDown, Info, Undo2 } from 'lucide-react'
import { Button, Chip } from '@/components/ui'
import { findModality } from '@/data/planning'
import { PERIOD_LABEL } from '@/data/planning'
import type { DateKey, DB, Workout } from '@/data/types'
import { cn } from '@/lib/cn'
import { capitalize, dayLabel } from '../agents/common'
import { ChecklistRows, DayRows } from '../lumos-ui'
import { hasWork } from './apply'
import { durationText, visibleChanges } from './planner'
import type { ChangePlan, PlanChange, WorkoutDraft } from './types'

export type AdjustStatus = 'preview' | 'applied' | 'cancelled' | 'undone'

function SessionRow({ db, w, today, muted, skipped }: { db: DB; w: Workout | WorkoutDraft; today: DateKey; muted?: boolean; skipped?: boolean }) {
  const m = findModality(db.profile, w.modality)
  const when = [capitalize(dayLabel(w.date, today)), w.time ?? (w.period ? PERIOD_LABEL[w.period] : undefined)].filter(Boolean).join(' · ')
  const dur = w.plannedDurationMin ? durationText(w.plannedDurationMin) + (w.plannedDurationMaxMin ? `–${durationText(w.plannedDurationMaxMin)}` : '') : undefined
  return (
    <div className={cn('flex items-center gap-3 px-3.5 py-2.5', muted && 'opacity-60')}>
      <span className="h-9 w-9 rounded-xl bg-surface-2 flex items-center justify-center text-[17px] shrink-0" aria-hidden>
        {m?.emoji ?? '✨'}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('text-[14.5px] leading-snug font-medium truncate', skipped && 'line-through decoration-1')}>
          {w.title || m?.label || w.modality}
          {w.isKeySession && <span className="ml-1" aria-label="sessão-chave">🔥</span>}
        </div>
        <div className="text-[12.5px] text-muted truncate">{[when, dur, skipped ? 'pulado' : undefined].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  )
}

function ChangeRows({ db, c, today }: { db: DB; c: PlanChange; today: DateKey }) {
  const skipped = c.after.status === 'pulado' || c.kind === 'remove'
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden">
      {c.before && !skipped && (
        <>
          <SessionRow db={db} w={c.before} today={today} muted />
          <div className="flex items-center gap-2 px-3.5 -my-1 text-muted" aria-hidden>
            <ArrowDown size={14} className="ml-2.5" />
          </div>
        </>
      )}
      <SessionRow db={db} w={skipped && c.before ? c.before : c.after} today={today} skipped={skipped} />
      {!!c.sources?.length && <div className="px-3.5 pb-2.5 -mt-0.5 text-[12px] text-muted leading-snug">{c.sources.join(' · ')}</div>}
    </div>
  )
}

export interface AdjustCardProps {
  db: DB
  today: DateKey
  plan: ChangePlan
  status: AdjustStatus
  onConfirm: () => void
  onFineTune: () => void
  onCancel: () => void
  onChoose: (plan: ChangePlan) => void
  onFollowUp: (kind: 'strategy' | 'week' | 'newStrategy') => void
  /** "Desfazer" inside the card once applied. */
  onUndo?: () => void
  /** Opens a route (Meal prep). */
  onLink?: (to: string) => void
}

function title(plan: ChangePlan, status: AdjustStatus, work: boolean): string {
  if (!work) return plan.previewTitle ?? plan.summary
  if (status === 'applied') return plan.doneTitle ?? 'Feito ✓ Ficou assim:'
  if (status === 'cancelled') return 'Ok, deixei tudo como estava.'
  if (status === 'undone') return 'Desfeito — voltou como era.'
  return plan.previewTitle ?? 'Vou ajustar assim:'
}

export function AdjustCard({ db, today, plan, status, onConfirm, onFineTune, onCancel, onChoose, onFollowUp, onUndo, onLink }: AdjustCardProps) {
  const changes = visibleChanges(plan)
  const primary = changes[0]
  const fuelable = primary && primary.after.status !== 'pulado' && primary.kind !== 'remove'
  const work = hasWork(plan)
  const dayOnly = !changes.length
  const showBody = !plan.needsChoice && status !== 'cancelled'
  const eyebrow = plan.checklist ? '✨ Lumos · checklist' : changes.length ? '✨ Lumos · ajustar por conversa' : '✨ Lumos · seu dia'

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.45 }} className="card p-4 space-y-3.5">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <p className="font-display text-[19px] leading-snug mt-1">{plan.needsChoice ? plan.needsChoice.question : title(plan, status, work)}</p>
        {!plan.needsChoice && work && status === 'preview' && plan.previewTitle && plan.summary && dayOnly && !plan.checklist && !plan.dayRows?.length && (
          <p className="text-[13.5px] text-ink-2 mt-1 leading-snug">{plan.summary}</p>
        )}
        {!plan.needsChoice && plan.subtitle && <p className="text-[12.5px] text-muted mt-1 leading-snug">{plan.subtitle}</p>}
      </div>

      {plan.needsChoice && (
        <div className="flex flex-col items-start gap-2">
          {plan.needsChoice.options.map((o) => (
            <Chip key={o.label} onClick={() => onChoose(o.plan)} className="h-auto min-h-11 py-2 text-left">
              {o.label}
            </Chip>
          ))}
        </div>
      )}

      {showBody && changes.length > 0 && (
        <div className="space-y-2">
          {changes.map((c) => (
            <ChangeRows key={c.after.id} db={db} c={c} today={today} />
          ))}
          {plan.changes.length > changes.length && <p className="text-[12px] text-muted px-0.5">O resto do dia fica como estava no seu template.</p>}
        </div>
      )}

      {showBody && !!plan.dayRows?.length && status !== 'undone' && (
        <section>
          {plan.dayDate && changes.length > 0 && <div className="text-[13px] font-semibold text-ink-2 px-0.5 mb-1.5">Linha do dia · {dayLabel(plan.dayDate, today)}</div>}
          <DayRows rows={plan.dayRows} />
        </section>
      )}

      {showBody && !!plan.checklist?.length && <ChecklistRows lines={plan.checklist} />}

      {showBody && plan.consequences.length > 0 && (
        <section>
          <div className="text-[13px] font-semibold text-ink-2 px-0.5 mb-1.5">{changes.length || plan.scheduleOps?.length ? 'Isso muda também:' : 'Bom saber:'}</div>
          <ul className="space-y-1.5">
            {plan.consequences.map((t) => (
              <li key={t} className="flex gap-2 text-[13.5px] leading-snug text-ink-2">
                <span className="text-muted shrink-0" aria-hidden>
                  •
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showBody && plan.warnings.length > 0 && (
        <div className="space-y-1.5">
          {plan.warnings.map((w) => {
            const warn = w.severity === 'warn'
            return (
              <div key={w.key} className={cn('flex gap-2.5 rounded-2xl px-3.5 py-2.5', warn ? 'bg-sand-soft' : 'bg-surface-2')} role="status">
                {warn ? <AlertTriangle size={16} className="text-sand shrink-0 mt-0.5" /> : <Info size={16} className="text-muted shrink-0 mt-0.5" />}
                <div className="min-w-0 text-[13.5px] leading-snug">
                  {w.message.replace(/^⚠️\s*/, '')}
                  <span className="text-muted"> · {w.title}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!plan.needsChoice && work && status === 'preview' && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Button size="sm" onClick={onConfirm}>
            {plan.confirmLabel ?? 'Confirmar'}
          </Button>
          {changes.length > 0 && (
            <Button size="sm" variant="soft" onClick={onFineTune}>
              Ajustar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {plan.confirmLabel === 'Aplicar' ? 'Agora não' : 'Cancelar'}
          </Button>
        </div>
      )}

      {(status === 'applied' || (plan.link && status !== 'cancelled')) && !plan.needsChoice && (
        <div className="flex flex-wrap gap-2">
          {status === 'applied' && onUndo && (
            <Chip onClick={onUndo}>
              <Undo2 size={14} aria-hidden />
              Desfazer
            </Chip>
          )}
          {status === 'applied' && fuelable && <Chip onClick={() => onFollowUp('strategy')}>Ver estratégia</Chip>}
          {status === 'applied' && plan.offerStrategy && <Chip onClick={() => onFollowUp('newStrategy')}>Cadastrar estratégia</Chip>}
          {status === 'applied' && changes.length > 0 && <Chip onClick={() => onFollowUp('week')}>Ver semana</Chip>}
          {plan.link && onLink && <Chip onClick={() => onLink(plan.link!.to)}>{plan.link.label} →</Chip>}
        </div>
      )}
    </motion.div>
  )
}
