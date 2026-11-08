/** Small building blocks of the universal calendar (no emojis: lucide icons + category color). */
import type { CSSProperties } from 'react'
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckSquare,
  Dumbbell,
  Flag,
  GraduationCap,
  Hotel,
  Hourglass,
  PawPrint,
  Plane,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { CATEGORY_META, isSpan, STATUS_LABEL, type CalendarConflict, type CalendarEntry } from '@/data/calendar/universal'
import { formatDayMonth } from '@/lib/date'
import { cn } from '@/lib/cn'

export function iconOf(e: CalendarEntry): LucideIcon {
  switch (e.sourceType) {
    case 'workout':
      return Dumbbell
    case 'task':
      return CheckSquare
    case 'taskDeadline':
    case 'tripDeadline':
    case 'content':
    case 'partnership':
    case 'delivery':
    case 'milestone':
      return Flag
    case 'waiting':
      return Hourglass
    case 'school':
      return GraduationCap
    case 'work':
      return Briefcase
    case 'petTask':
    case 'petBirthday':
      return PawPrint
    case 'bill':
    case 'receivable':
      return Wallet
    case 'meeting':
    case 'contact':
    case 'opportunity':
    case 'ugcFollowUp':
      return Users
    case 'trip':
      return Plane
    case 'tripItem':
      return e.title.toLowerCase().startsWith('hospedagem') ? Hotel : /\bvoo\b|flight/i.test(e.title) ? Plane : CalendarDays
    default:
      return e.category === 'estudo' ? BookOpen : CalendarDays
  }
}

export const catColor = (e: Pick<CalendarEntry, 'category'>) => CATEGORY_META[e.category].color
export const catSoft = (e: Pick<CalendarEntry, 'category'>) => CATEGORY_META[e.category].soft

/** "13:00–15:00", "dia todo", "24/10 – 13/11". */
export function whenLabel(e: CalendarEntry): string {
  if (isSpan(e)) return `${formatDayMonth(e.startAt.date)} – ${formatDayMonth(e.endAt.date)}${e.startAt.time ? ` · ${e.startAt.time}` : ''}`
  if (e.allDay || !e.startAt.time) return 'dia todo'
  return e.endAt.time && e.endAt.time !== e.startAt.time ? `${e.startAt.time}–${e.endAt.time}` : e.startAt.time
}

export function CategoryDot({ entry, className, style }: { entry: Pick<CalendarEntry, 'category'>; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn('inline-block h-2 w-2 rounded-full shrink-0', className)} style={{ background: catColor(entry), ...style }} />
}

/** Status in words, quiet; pending things are the ones that ask for attention. */
export function StatusTag({ entry, className }: { entry: CalendarEntry; className?: string }) {
  if (entry.status === 'confirmado' && !entry.optional) return null
  if (entry.status === 'planejado' && !entry.optional) return null
  const label = entry.optional ? 'opcional' : STATUS_LABEL[entry.status]
  return (
    <span
      className={cn(
        'inline-flex items-center h-[17px] px-1.5 rounded-full text-[10.5px] leading-none whitespace-nowrap shrink-0',
        entry.status === 'pendente' ? 'border border-dashed border-sand text-ink-2' : 'bg-surface-2 text-muted',
        className,
      )}
    >
      {label}
    </span>
  )
}

export function ConflictMark({ conflicts, size = 13 }: { conflicts?: CalendarConflict[]; size?: number }) {
  if (!conflicts?.length) return null
  const text = conflicts.map((c) => c.text).join(' ')
  return (
    <span className="inline-flex shrink-0 text-sand" role="img" aria-label={`Atenção: ${text}`} title={text}>
      <TriangleAlert size={size} strokeWidth={2} />
    </span>
  )
}

/** Compact row: time · color bar · title · status. Used by Semana, Lista and the all-day row. */
export function EntryLine({
  entry,
  conflicts,
  onOpen,
  dense,
  selected,
  showWhen = true,
}: {
  entry: CalendarEntry
  conflicts?: CalendarConflict[]
  onOpen: (e: CalendarEntry) => void
  dense?: boolean
  selected?: boolean
  showWhen?: boolean
}) {
  const Icon = iconOf(entry)
  const done = entry.status === 'feito'
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      aria-label={`${entry.title}, ${whenLabel(entry)}${entry.status !== 'confirmado' ? `, ${entry.optional ? 'opcional' : STATUS_LABEL[entry.status]}` : ''}`}
      data-entry={entry.id}
      className={cn(
        'w-full flex items-center gap-2.5 text-left rounded-xl px-2 -mx-2 transition-colors active:bg-surface-2',
        dense ? 'min-h-10 py-1' : 'min-h-12 py-1.5',
        selected && 'bg-surface-2',
        (entry.optional || entry.base) && 'opacity-75',
      )}
    >
      {showWhen && (
        <span className={cn('shrink-0 tabular-nums text-ink-2', dense ? 'w-[74px] text-[12px]' : 'w-[84px] text-[13px]', (entry.allDay || isSpan(entry)) && 'text-muted text-[11.5px]')}>
          {entry.approx ? 'horário a definir' : whenLabel(entry)}
        </span>
      )}
      <span aria-hidden className="w-[3px] self-stretch my-1 rounded-full shrink-0" style={{ background: catColor(entry) }} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <Icon size={14} className="shrink-0 text-muted" aria-hidden />
          <span className={cn('truncate leading-snug', dense ? 'text-[13.5px]' : 'text-[14.5px]', done && 'line-through decoration-muted/60 text-muted')}>{entry.title}</span>
          <ConflictMark conflicts={conflicts} />
          <StatusTag entry={entry} />
        </span>
        {!dense && (entry.location || entry.sourceLabel) && (
          <span className="block truncate text-[12px] text-muted leading-tight mt-0.5">{[entry.sourceLabel, entry.location].filter(Boolean).join(' · ')}</span>
        )}
      </span>
    </button>
  )
}
