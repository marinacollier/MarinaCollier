import { openSheet, toast } from '@/app/ui-store'
import { actions, getDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { tone as toneOf } from '@/components/ui'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'
import { PLAN_LABEL, type DayEntry, type LooseItem } from './selectors'

/** Open the right sheet for a timeline entry. */
export function openEntry(e: DayEntry, today: DateKey) {
  haptic('light')
  if (e.kind === 'block') return
  // The day travels along so a recurring event can be changed "só nesse dia".
  if (e.kind === 'event') openSheet('event', { id: e.id, date: e.startsOn ? undefined : e.date })
  else if (e.kind === 'workout') {
    if (e.date > today) openSheet('workout', { id: e.id })
    else openSheet('workoutLog', { id: e.id })
  } else openSheet('task', { id: e.id })
}

export function openLoose(item: LooseItem, date: DateKey) {
  haptic('light')
  if (item.taskId) openSheet('task', { id: item.taskId })
  else openSheet('priorities', { date })
}

/** Complete a loose item (task or day priority) for `date`. */
export function completeLoose(item: LooseItem, date: DateKey) {
  const db = getDB()
  if (item.kind === 'priority') actions.update('priorities', item.id, { done: true })
  const task = item.taskId ? db.tasks.find((t) => t.id === item.taskId) : undefined
  if (task) {
    if (task.recurrence) {
      if (!db.occurrences.some((o) => o.parentType === 'task' && o.parentId === task.id && o.date === date)) {
        actions.toggleOccurrence('task', task.id, date)
      }
    } else actions.update('tasks', task.id, { status: 'done', completedAt: nowISO() })
  }
  haptic('success')
  toast('Feito ✨ que bom!', { tone: 'win' })
}

/** iOS-style switch. 44px hit area. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        haptic('light')
        onChange(!checked)
      }}
      className="h-11 -my-1.5 px-0.5 inline-flex items-center shrink-0"
    >
      <span className={cn('relative h-[28px] w-[46px] rounded-full transition-colors duration-200', checked ? 'bg-sage' : 'bg-line')}>
        <span
          className={cn(
            'absolute top-[3px] left-[3px] h-[22px] w-[22px] rounded-full bg-surface shadow-sm transition-transform duration-200',
            checked && 'translate-x-[18px]',
          )}
        />
      </span>
    </button>
  )
}

/** Small colored bar/dot for an entry: source color when it comes from outside, tone otherwise. */
export function EntryDot({ entry, className }: { entry: DayEntry; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2 w-2 rounded-full shrink-0', !entry.sourceColor && toneOf(entry.tone).dot, className)}
      style={entry.sourceColor ? { background: entry.sourceColor } : undefined}
    />
  )
}

/** Compact row: "07:00 · 🏃‍♀️ Treino". Used by Semana and Agenda views. */
export function EntryRow({ entry, today, dense }: { entry: DayEntry; today: DateKey; dense?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => openEntry(entry, today)}
      className={cn('w-full flex items-center gap-3 text-left active:bg-surface-2 transition-colors rounded-xl px-2 -mx-2', dense ? 'min-h-11 py-1.5' : 'min-h-[52px] py-2')}
    >
      <span className="w-[46px] shrink-0 text-[13px] tabular-nums text-ink-2 font-medium">
        {entry.allDay ? (
          <span className="text-[11px] text-muted font-normal">dia todo</span>
        ) : entry.approx ? (
          <span className="text-[12.5px] text-ink-2 font-normal italic">{entry.periodLabel}</span>
        ) : (
          entry.time
        )}
      </span>
      <EntryDot entry={entry} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={cn('truncate text-[15px] leading-snug', entry.done && 'line-through decoration-muted/60 text-muted')}>
            {entry.emoji && entry.emoji !== '✓' && <span className="mr-1.5">{entry.emoji}</span>}
            {entry.title}
          </span>
          <EntryMarks entry={entry} />
        </span>
        {(entry.rangeLabel || entry.subtitle || entry.endTime) && !dense && (
          <span className="block truncate text-[12.5px] text-muted">
            {[entry.rangeLabel, !entry.allDay && !entry.approx && entry.endTime ? `até ${entry.endTime}` : undefined, entry.subtitle].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </button>
  )
}

/** Tiny markers after a title: plan type (FIXO/BASE/…), ⚠️ planning conflict, 📋 pauta. */
export function EntryMarks({ entry, plan = true, className }: { entry: DayEntry; plan?: boolean; className?: string }) {
  const warn = entry.conflicts?.length
  if (!warn && !entry.hasTemplate && !(plan && entry.planType)) return null
  return (
    <span className={cn('inline-flex items-center gap-1 shrink-0', className)}>
      {plan && entry.planType && <PlanTag type={entry.planType} />}
      {entry.hasTemplate && (
        <span className="text-[11px] leading-none" role="img" aria-label="Tem pauta">
          📋
        </span>
      )}
      {!!warn && (
        <span className="text-[11px] leading-none" role="img" aria-label={entry.conflicts!.map((c) => c.message).join(' ')} title={entry.conflicts![0].message}>
          ⚠️
        </span>
      )}
    </span>
  )
}

export function PlanTag({ type, className }: { type: NonNullable<DayEntry['planType']>; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-[15px] px-1 rounded-[5px] text-[8.5px] font-semibold tracking-[0.06em] leading-none whitespace-nowrap',
        type === 'a_confirmar' ? 'bg-sand-soft text-sand border border-dashed border-sand/50' : 'bg-ink/[0.06] text-ink-2/80',
        className,
      )}
    >
      {PLAN_LABEL[type]}
    </span>
  )
}
