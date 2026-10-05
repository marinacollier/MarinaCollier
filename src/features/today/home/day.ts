/**
 * The Home's two time blocks, from the real Linha do dia (pure + tested):
 *
 *   AGORA / PRÓXIMO   "agora · Livre até 19:00 · depois 20:00 Jantar"
 *                     "agora FashionFinder · 15:30 Reunião"
 *   RESTANTE DO DIA   a few relevant rows — events, trainings, main meals, timed tasks, a routine as ONE line.
 *
 * What is NOT here on purpose: every routine step, prep checklists, Luna's anytime care, intra-treino fuel.
 * They live in the full Linha do dia (one tap away). No names: the project shown during work comes from
 * the day's priorities / nearest delivery (priorityProject).
 */
import { endMin, isAnytime, startMin } from '@/data/timeline'
import type { DateKey, DB, TimeHM, TimelineEntry } from '@/data/types'
import { hmToMinutes, minutesToHM, type DayPart } from '@/lib/date'
import { priorityProject } from '../context'
import { routineLookup } from '../timeline/view'

export interface DayRow {
  key: string
  kind: TimelineEntry['kind']
  start: TimeHM
  end?: TimeHM
  title: string
  emoji?: string
  /** Time is approximate ("noite · horário a definir"). */
  approx: boolean
  subtitle?: string
  entry: TimelineEntry
}

export interface NowLine {
  /** 'busy' = something is happening; 'free' = nothing until `until` (or the rest of the day). */
  state: 'busy' | 'free'
  title: string
  emoji?: string
  until?: TimeHM
  /** "trabalho até 18:00" under a project name. */
  note?: string
  row?: DayRow
}

export interface HomeDay {
  now: NowLine
  next?: DayRow
  /** After `next`, capped. */
  rest: DayRow[]
  /** Relevant rows left out of `rest` by the cap. */
  more: number
}

export const REST_MAX = 4

/** Rows that deserve a line on Home. Routine items collapse into one row per routine. */
export function relevantRows(db: DB, entries: TimelineEntry[]): DayRow[] {
  const routineOf = routineLookup(db)
  const rows: DayRow[] = []
  const routines = new Map<string, DayRow & { all: TimelineEntry[] }>()
  for (const e of entries) {
    if (isAnytime(e) || !e.start) continue
    if (e.status === 'cancelled' || e.status === 'skipped') continue
    if (e.kind === 'prep' || e.kind === 'petTask') continue
    if (e.kind === 'meal' && e.phase === 'intra') continue
    const r = e.kind === 'routineItem' || e.kind === 'routine' ? routineOf(e) : undefined
    if (r) {
      const cur = routines.get(r.id)
      if (!cur) {
        const row = { key: `routine:${r.id}`, kind: 'routine' as const, start: e.start, end: e.end, title: r.name, emoji: r.emoji, approx: false, entry: e, all: [e] }
        routines.set(r.id, row)
        rows.push(row)
      } else {
        cur.all.push(e)
        if (e.start < cur.start) cur.start = e.start
        if ((e.end ?? e.start) > (cur.end ?? cur.start)) cur.end = e.end ?? e.start
      }
      continue
    }
    rows.push({
      key: e.key,
      kind: e.kind,
      start: e.start,
      end: e.end,
      title: e.title,
      emoji: e.emoji,
      approx: e.timeSource === 'approx',
      subtitle: e.kind === 'work' ? e.subtitle : undefined,
      entry: e,
    })
  }
  // A routine counts as done when every step is.
  const out = rows.map((row) => {
    const all = (row as { all?: TimelineEntry[] }).all
    if (!all) return row
    const done = all.every((e) => e.status === 'done')
    const clean: DayRow = { key: row.key, kind: row.kind, start: row.start, end: row.end, title: row.title, emoji: row.emoji, approx: false, entry: done ? { ...row.entry, status: 'done' } : { ...row.entry, status: 'pending' } }
    return clean
  })
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

const rowStart = (r: DayRow) => startMin(r.entry) ?? 0
const rowEnd = (r: DayRow) => (r.end ? Math.max(hmToMinutes(r.end), rowStart(r) + 1) : (endMin(r.entry) ?? rowStart(r) + 30))
const pending = (r: DayRow) => r.entry.status === 'pending'

/** Happening now beats background: an event/training over a routine, a routine over a meal, all over work. */
const NOW_RANK: Partial<Record<DayRow['kind'], number>> = { event: 0, workout: 0, task: 1, routine: 2, meal: 3, work: 4 }

export function homeDay(db: DB, today: DateKey, minutes: number, entries: TimelineEntry[]): HomeDay {
  const rows = relevantRows(db, entries).filter(pending)
  const current = rows
    .filter((r) => !r.approx && rowStart(r) <= minutes && minutes < rowEnd(r))
    .sort((a, b) => (NOW_RANK[a.kind] ?? 5) - (NOW_RANK[b.kind] ?? 5) || rowStart(b) - rowStart(a))[0]
  const later = rows.filter((r) => rowStart(r) > minutes && r !== current)
  const next = later[0]
  const restAll = later.slice(1)
  const rest = restAll.slice(0, REST_MAX)

  let now: NowLine
  if (current) {
    const until = current.end ?? minutesToHM(rowEnd(current))
    if (current.kind === 'work') {
      const project = priorityProject(db, today)
      now = project
        ? { state: 'busy', title: project.name, emoji: project.emoji, until, note: `${current.title.toLowerCase()} até ${until}`, row: current }
        : { state: 'busy', title: current.title, emoji: current.emoji, until, row: current }
    } else {
      now = { state: 'busy', title: current.title, emoji: current.emoji, until, row: current }
    }
  } else {
    now = { state: 'free', title: 'Livre', until: next && !next.approx ? next.start : undefined }
  }
  return { now, next, rest, more: restAll.length - rest.length }
}

/** Contextual placeholder for the Lumos composer (Marina's own phrasing). */
export function composerPlaceholder(part: DayPart, opts: { workNow?: boolean } = {}): string {
  if (part === 'manha') return 'o que eu tenho hoje?'
  if (part === 'dia') return opts.workNow ? 'o que precisa de mim?' : 'o que mudou?'
  return 'me ajuda a organizar amanhã'
}

/** "agora · Livre até 19:00" bits, for tests and aria labels. */
export function nowLabel(n: NowLine): string {
  if (n.state === 'free') return n.until ? `Livre até ${n.until}` : 'Livre'
  return n.title
}
