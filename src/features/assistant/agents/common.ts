import type { DateKey, DB, Task } from '@/data/types'
import { diffDays, formatShortDate, relativeDay } from '@/lib/date'
import { sheetAction } from '@/features/search/actions'
import type { AnswerItem } from '../types'

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "há 10 dias", "desde ontem", "desde hoje". */
export function sinceLabel(since: DateKey | undefined, today: DateKey): string | undefined {
  if (!since) return undefined
  const d = diffDays(since, today)
  if (d <= 0) return 'desde hoje'
  if (d === 1) return 'desde ontem'
  return `há ${d} dias`
}

export function dayLabel(date: DateKey, today: DateKey): string {
  const d = diffDays(today, date)
  return d >= -1 && d < 7 ? relativeDay(date, today) : formatShortDate(date)
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Natural pt-BR list: "a, b e c". */
export function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

export function taskItem(db: DB, t: Task, today: DateKey, subtitle?: string): AnswerItem {
  const proj = t.projectId ? db.projects.find((p) => p.id === t.projectId) : undefined
  const parts: string[] = []
  if (subtitle) parts.push(subtitle)
  else {
    if (t.status === 'waiting') parts.push(`${t.waiting?.who ?? 'alguém'} · ${sinceLabel(t.waiting?.since, today) ?? ''}`.replace(/ · $/, ''))
    const when = t.dueDate ?? t.date
    if (when && t.status !== 'waiting') parts.push(when < today ? 'ficou de antes' : dayLabel(when, today))
    if (proj) parts.push(proj.name)
  }
  return {
    id: `task:${t.id}`,
    emoji: t.status === 'waiting' ? '⏳' : t.needsMe ? '🙋‍♀️' : proj?.emoji ?? '✓',
    title: t.title,
    subtitle: parts.join(' · ') || undefined,
    action: sheetAction('task', { id: t.id }),
  }
}
