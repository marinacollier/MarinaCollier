/**
 * ActionItem → the standard ItemRow (area tag + ONE fact), and the Home's split into
 * Agora (max 3: happening, soon, overdue) · Hoje (everything else, timed first) · Feitos.
 * Pure (tested in rows.test.ts): presentation only, the projection stays in data/agenda/items.ts.
 */
import type { RowArea } from '@/components/ui/ItemRow'
import type { ActionItem } from '@/data/agenda/items'
import type { DateKey, DayPriority, DB } from '@/data/types'
import { addDays, formatDayMonth, hmToMinutes } from '@/lib/date'

/** Where the row belongs, from the projection's front label (and its group as fallback). */
export function areaOf(item: Pick<ActionItem, 'front'>): RowArea {
  const l = item.front.label
  if (/^TREINO|^NUTRI|SAÚDE/.test(l)) return 'corpo'
  if (/^VIAGEM/.test(l)) return 'viagem'
  if (/^LUNA/.test(l)) return 'luna'
  if (/^DINHEIRO/.test(l)) return 'dinheiro'
  if (/^BÍBLIA/.test(l)) return 'fe'
  if (/^ESTUDO/.test(l)) return 'estudo'
  if (/^UGC|^CONTEÚDO/.test(l)) return 'creator'
  if (/^ROTINA|^VIDA|^AGENDA$/.test(l)) return 'vida'
  if (item.front.group === 'trabalho') return 'trabalho'
  if (item.front.group === 'corpo') return 'corpo'
  return l ? 'vida' : 'outro'
}

const GENERIC = new Set(['TREINO', 'NUTRIÇÃO', 'LUNA', 'DINHEIRO', 'BÍBLIA', 'ESTUDO', 'UGC', 'CONTEÚDO', 'ROTINA', 'VIDA', 'AGENDA', 'AGENDA · SAÚDE', 'AGENDA · TRABALHO', 'TRABALHO', 'CARREIRA', 'VIAGEM'])
const sentence = (s: string) => s.toLocaleLowerCase('pt-BR').replace(/(^|\s|·\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('pt-BR'))

/** The front label when it says something the area tag doesn't ("Santander", "Cape Town"). */
function specificFront(label: string): string | undefined {
  if (!label || GENERIC.has(label)) return undefined
  return sentence(label.replace(/^VIAGEM · /, ''))
}

export interface RowView {
  area: RowArea
  meta?: string
  late?: boolean
  priority?: 1 | 2
}

/** The one quiet fact under the title. `minutes` = now, to say "passou das 08:00". */
export function rowView(db: DB, item: ActionItem, today: DateKey, minutes: number): RowView {
  const area = areaOf(item)
  const done = item.status === 'done'
  const task = item.refType === 'task' ? db.tasks.find((t) => t.id === item.refId) : undefined
  const priority: 1 | 2 | undefined = item.priority !== undefined || task?.priority === 'alta' ? 1 : undefined
  if (done) return { area, meta: item.doneAt ? `feito ${item.doneAt}` : specificFront(item.front.label), priority }
  if (item.carried) {
    if (item.sub?.startsWith('atrasado')) return { area, meta: item.sub, late: true, priority }
    const from = task?.date
    return { area, meta: from === addDays(today, -1) ? 'ficou de ontem' : from ? `ficou de ${formatDayMonth(from)}` : 'ficou de antes', late: true, priority }
  }
  if (item.date === today && item.start && item.check !== 'none') {
    const end = item.end ? hmToMinutes(item.end) : hmToMinutes(item.start) + 30
    if (end <= minutes) return { area, meta: `passou das ${item.start}`, late: true, priority }
  }
  const late = !!item.sub && /antes|venceu|atrasad/.test(item.sub)
  const front = specificFront(item.front.label)
  // One fact: the first bit of the projection's line (meals' ingredients and long UGC notes stay in the sheet).
  const sub = item.sub && item.sub !== 'quando der' && item.check !== 'meal' ? item.sub.split(' · ')[0] : undefined
  return { area, meta: sub && front ? `${front} · ${sub}` : (sub ?? front ?? (item.sub === 'quando der' ? 'quando der' : undefined)), late, priority }
}

const startOf = (i: ActionItem) => (i.start ? hmToMinutes(i.start) : undefined)
const live = (i: ActionItem) => i.status !== 'cancelled' && i.status !== 'skipped'

export const AGORA_MAX = 3
/** "Soon" = starts within this many minutes. */
export const SOON_MIN = 90

export interface HomeLists {
  agora: ActionItem[]
  hoje: ActionItem[]
  done: ActionItem[]
}

/** Untimed order: Top 3, what matters, carried last, then by front. */
function untimedOrder(a: ActionItem, b: ActionItem): number {
  const pa = a.priority ?? 9
  const pb = b.priority ?? 9
  if (pa !== pb) return pa - pb
  if (a.important !== b.important) return a.important ? -1 : 1
  if (!!a.carried !== !!b.carried) return a.carried ? 1 : -1
  return a.front.label.localeCompare(b.front.label) || a.title.localeCompare(b.title)
}

/**
 * Agora: happening now, then starting within SOON_MIN, then overdue (time passed, still open — not meals or
 * routines, which just quietly stay in Hoje). Max 3, never repeated in Hoje.
 */
export function homeLists(items: ActionItem[], minutes: number): HomeLists {
  const open = items.filter((i) => live(i) && i.status !== 'done')
  const done = items.filter((i) => i.status === 'done').sort((a, b) => (a.doneAt ?? a.start ?? '').localeCompare(b.doneAt ?? b.start ?? ''))
  const timed = open.filter((i) => startOf(i) !== undefined).sort((a, b) => startOf(a)! - startOf(b)! || a.title.localeCompare(b.title))
  const endOf = (i: ActionItem) => (i.end ? hmToMinutes(i.end) : startOf(i)! + 30)
  const now = timed.filter((i) => startOf(i)! <= minutes && minutes < endOf(i))
  const soon = timed.filter((i) => startOf(i)! > minutes && startOf(i)! - minutes <= SOON_MIN)
  const overdue = timed.filter((i) => endOf(i) <= minutes && i.check !== 'meal' && i.check !== 'routine' && i.check !== 'none').reverse()
  const agora = [...now, ...soon, ...overdue].slice(0, AGORA_MAX)
  const rest = open.filter((i) => !agora.includes(i))
  const hoje = [...rest.filter((i) => startOf(i) !== undefined).sort((a, b) => startOf(a)! - startOf(b)!), ...rest.filter((i) => startOf(i) === undefined).sort(untimedOrder)]
  return { agora, hoje, done }
}

/** Top 3 written as free text (not pointing at any row of the day) — they still show, as rows. */
export function loosePriorities(priorities: DayPriority[], items: ActionItem[]): DayPriority[] {
  return priorities.filter((p) => !items.some((it) => it.priority !== undefined && ((p.ref && it.refType === p.ref.type && it.refId === p.ref.id) || it.title.trim().toLowerCase() === p.title.trim().toLowerCase())))
}

/** "3 coisas · Santander épicos · Cerâmica 18:00" for a closed day. */
export function daySummary(items: ActionItem[], highlights: ActionItem[]): string {
  const n = items.filter((i) => i.status !== 'done').length
  if (!n) return 'livre'
  const bits = highlights.slice(0, 2).map((h) => (h.start ? `${h.title} ${h.start}` : h.title))
  return [`${n} ${n === 1 ? 'coisa' : 'coisas'}`, ...bits].join(' · ')
}
