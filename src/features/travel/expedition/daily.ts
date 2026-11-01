/**
 * Expedição · DAILY MANDATORY BLOCKS (brief operacional 01/11) — pure, computed every time, never stored.
 *
 * On every day of the rule (South Africa: 02–16/11) the day carries five blocks:
 *   (a) ≥30 min de trabalho Fashion Finder (her focus list),
 *   (b) ≥30 min de estudo individual de inglês (10 vocabulário · 10 gramática · 10 listening/speaking —
 *       school classes do NOT count),
 *   (c) 60 min de treino / atividade física, adapted: a trip activity that counts as training (gravel, caiaque,
 *       snorkel, natação, surf, trilha…) or the trip's own workout fills it; on long-travel / shark-dive /
 *       safari days it becomes "recuperação e mobilidade, sem forçar",
 *   (d) alimentação e hidratação,
 *   (e) revisão das reservas de amanhã.
 *
 * Each timed block gets a suggested window that never overlaps class, the day's items or another block
 * (defaults: treino 07:00–08:00, trabalho 19:30–20:00, inglês 20:00–20:30, revisão 20:30–20:45).
 * Ticking a block stores ONE Occurrence (parentType 'item', parentId `trip:<tripId>:<kind>`, that date), so the
 * tick persists and syncs like every other Home mark; the blocks themselves are never records.
 */
import type { DateKey, Occurrence, TimeHM, Trip, TripItem, Workout } from '@/data/types'
import { SEED_IDS } from '@/data/seed/ids'
import { addDays, hmToMinutes, minutesToHM, weekday } from '@/lib/date'
import { BOOKING_STATUS_META, bookingStatusOf } from './command'
import { busyWindow, classOn, isActive, itemsOnDay, schoolHolidayOn } from './logic'

export type DailyBlockKind = 'treino' | 'trabalho' | 'ingles' | 'alimentacao' | 'revisao'

export interface DailyRule {
  from: DateKey
  until: DateKey
  /** Long travel, shark dive, safari (from her brief); days with a flight / shark dive / safari item join them. */
  recovery: DateKey[]
}

/** The trips her brief covers (others get no mandatory blocks). */
export const DAILY_RULES: Record<string, DailyRule> = {
  [SEED_IDS.tripAfrica]: { from: '2026-11-02', until: '2026-11-16', recovery: ['2026-11-06', '2026-11-13', '2026-11-14', '2026-11-15'] },
}

export const WORK_FOCUS = [
  'Acompanhar Lucas e o app',
  'Google Play e Apple',
  'Testes internos',
  'Validar busca visual e matches',
  'Bloqueios do lançamento de dezembro',
  'Mensagens importantes',
]
export const ENGLISH_PARTS = ['10 min · vocabulário e expressões', '10 min · gramática e erros', '10 min · listening e speaking']

export interface DailyBlock {
  kind: DailyBlockKind
  /** Occurrence parentId of the tick. */
  key: string
  title: string
  emoji: string
  minutes?: number
  start?: TimeHM
  end?: TimeHM
  /** One quieter line under the title. */
  sub?: string
  /** Focus list / parts (work, English). */
  parts?: string[]
  /** The trip activity or workout that fills the training block. */
  filledBy?: string
  recovery?: boolean
  done: boolean
  /** One of the three blocks she named as mandatory (trabalho, inglês, treino). */
  core: boolean
}

export interface DailyPlan {
  date: DateKey
  blocks: DailyBlock[]
  notes: string[]
  done: number
  total: number
}

export const dailyKey = (tripId: string, kind: DailyBlockKind) => `trip:${tripId}:${kind}`

export function dailyRuleOn(trip: Pick<Trip, 'id'>, date: DateKey): DailyRule | undefined {
  const r = DAILY_RULES[trip.id]
  return r && date >= r.from && date <= r.until ? r : undefined
}

export function blockDoneOn(occurrences: Occurrence[], tripId: string, kind: DailyBlockKind, date: DateKey): Occurrence | undefined {
  const key = dailyKey(tripId, kind)
  return occurrences.find((o) => o.parentType === 'item' && o.parentId === key && o.date === date && o.status === 'done')
}

// ─── Busy time of a day ─────────────────────────────────────────────────────

export interface Busy {
  start: number
  end: number
  label: string
}

const isFlight = (i: TripItem) => i.section === 'voo' || i.checklistKind === 'voo'
/** Airport before a flight; getting out after it. A flight without an arrival time takes the rest of the day. */
const FLIGHT_BEFORE = 120
const FLIGHT_AFTER = 60
/** A start-only item is assumed to take at least this long. */
const POINT_MIN = 60

/** What already holds the day: class (unless a full-day absence) and every timed item (stays left out). */
export function busyOn(trip: Trip, items: TripItem[], date: DateKey): Busy[] {
  const out: Busy[] = []
  const day = itemsOnDay(items.filter(isActive), date)
  const block = classOn(trip.expedition, date)
  if (block && !day.some((i) => i.schoolImpact === 'dia')) out.push({ start: hmToMinutes(block.start), end: hmToMinutes(block.end), label: 'aula' })
  for (const i of day) {
    if (i.section === 'hospedagem') continue
    const w = busyWindow(i, date)
    if (!w) continue
    let { start, end } = w
    if (isFlight(i) && i.date === date) {
      start = Math.max(0, start - FLIGHT_BEFORE)
      end = end === w.start ? 24 * 60 : Math.min(24 * 60, end + FLIGHT_AFTER)
    } else if (end <= start) end = Math.min(24 * 60, start + POINT_MIN)
    out.push({ start, end, label: i.title })
  }
  return out.sort((a, b) => a.start - b.start)
}

const EARLIEST = 6 * 60
const LATEST = 22 * 60 + 30
const STEP = 15

/** First window of `minutes` from `pref` (forward to 22:30, then backward to 06:00) that touches nothing taken. */
export function placeWindow(pref: number, minutes: number, taken: Pick<Busy, 'start' | 'end'>[]): { start: number; end: number } | undefined {
  const fits = (s: number) => s >= EARLIEST && s + minutes <= LATEST && !taken.some((b) => s < b.end && b.start < s + minutes)
  for (let s = pref; s + minutes <= LATEST; s += STEP) if (fits(s)) return { start: s, end: s + minutes }
  for (let s = pref - STEP; s >= EARLIEST; s -= STEP) if (fits(s)) return { start: s, end: s + minutes }
  return undefined
}

// ─── Training of the day ────────────────────────────────────────────────────

const TRAINING_KINDS = new Set(['trilha', 'corrida', 'natacao', 'surf', 'bike'])
const TRAINING_WORDS = /\b(gravel|pedal|caiaque|kayak|snorkel|nata[cç][aã]o|surf|trilha|corrida|bike)\b/i

/** A trip activity that counts as the day's training (gravel, caiaque, snorkel, natação, surf, trilha…). */
export function countsAsTraining(i: TripItem): boolean {
  if (!isActive(i) || i.section === 'hospedagem' || isFlight(i)) return false
  return i.section === 'esporte' || (!!i.checklistKind && TRAINING_KINDS.has(i.checklistKind)) || TRAINING_WORDS.test(i.title)
}

const SHARK = /tubar|shark/i
/** Why a day is a recovery day (brief, flight, shark dive, safari), or undefined. */
export function recoveryReason(trip: Trip, items: TripItem[], date: DateKey): string | undefined {
  const day = itemsOnDay(items.filter(isActive), date)
  if (day.some((i) => SHARK.test(i.title) && i.date === date)) return 'mergulho com tubarões'
  if (day.some((i) => i.checklistKind === 'safari' || i.category === 'safari')) return 'safári'
  if (day.some((i) => isFlight(i) && i.date === date)) return 'deslocamento longo'
  if (DAILY_RULES[trip.id]?.recovery.includes(date)) return 'deslocamento longo'
  return undefined
}

const PERIOD_START: Record<string, number> = { manha: 7 * 60, tarde: 16 * 60, noite: 18 * 60 }

// ─── The plan of a day ──────────────────────────────────────────────────────

const label = (w: { start: number; end: number }) => ({ start: minutesToHM(w.start), end: minutesToHM(w.end) })

/** The five blocks of a day of the rule, placed without overlaps. Undefined outside the rule's dates. */
export function dailyPlan(trip: Trip, items: TripItem[], workouts: Workout[], occurrences: Occurrence[], date: DateKey): DailyPlan | undefined {
  if (!dailyRuleOn(trip, date)) return undefined
  const mine = items.filter((i) => i.tripId === trip.id)
  const busy = busyOn(trip, mine, date)
  const taken: Pick<Busy, 'start' | 'end'>[] = [...busy]
  const notes: string[] = []
  const done = (k: DailyBlockKind) => !!blockDoneOn(occurrences, trip.id, k, date)
  const key = (k: DailyBlockKind) => dailyKey(trip.id, k)
  const noWindow = 'Sem janela livre sem conflito — encaixe quando der.'
  const place = (pref: number, minutes: number) => {
    const w = placeWindow(pref, minutes, taken)
    if (w) taken.push(w)
    return w
  }

  const block = classOn(trip.expedition, date)
  if (block && weekday(date) === 5) notes.push('Sexta: confirmar o horário real da aula.')
  const holiday = schoolHolidayOn(trip.expedition, date)
  if (holiday) notes.push(`${holiday.label} (não é falta).`)

  // (c) training first: an activity's own time is fixed, everything else fits around it.
  const activities = mine.filter((i) => i.date === date && isActive(i) && !i.optional)
  const sport = activities.find(countsAsTraining)
  const ws = workouts.filter((w) => w.date === date && w.status !== 'pulado' && w.status !== 'descanso')
  const recovery = recoveryReason(trip, mine, date)
  let training: DailyBlock
  if (recovery) {
    const w = place(7 * 60, 30)
    const planned = sport?.title ?? ws[0]?.title ?? ws[0]?.modality
    training = {
      kind: 'treino',
      key: key('treino'),
      title: 'Recuperação e mobilidade, sem forçar',
      emoji: '🧘‍♀️',
      minutes: 30,
      ...(w ? label(w) : {}),
      sub: [`Dia de ${recovery}.`, planned ? `${planned} só se o corpo pedir.` : undefined, w ? undefined : noWindow].filter(Boolean).join(' '),
      recovery: true,
      done: done('treino'),
      core: true,
    }
  } else if (sport) {
    const w = busyWindow(sport, date)
    const timed = w && w.end > w.start ? label(w) : sport.time ? { start: sport.leaveTime ?? sport.time } : {}
    training = { kind: 'treino', key: key('treino'), title: `Treino do dia: ${sport.title}`, emoji: '🏄‍♀️', minutes: 60, ...timed, sub: 'A atividade conta como os 60 min de treino.', filledBy: sport.title, done: done('treino'), core: true }
  } else {
    const wk = ws[0]
    const minutes = wk?.plannedDurationMin ?? 60
    const pref = wk?.time ? hmToMinutes(wk.time) : (wk?.period && PERIOD_START[wk.period]) || 7 * 60
    const w = place(pref, minutes)
    training = {
      kind: 'treino',
      key: key('treino'),
      title: wk ? `Treino: ${wk.title ?? wk.modality}` : 'Treino ou atividade física · 60 min',
      emoji: '🏋️‍♀️',
      minutes,
      ...(w ? label(w) : {}),
      sub: [wk?.notes, w ? undefined : noWindow].filter(Boolean).join(' ') || undefined,
      filledBy: wk ? wk.title ?? wk.modality : undefined,
      done: done('treino') || wk?.status === 'feito',
      core: true,
    }
  }

  // (a) work, (b) English, (e) review — evening by default, moved only to avoid a clash.
  const work = place(19 * 60 + 30, 30)
  const english = place(20 * 60, 30)
  const review = place(20 * 60 + 30, 15)

  const tomorrow = addDays(date, 1)
  const tItems = mine.filter((i) => isActive(i) && i.date === tomorrow && i.status !== 'feito')
  const tLine = tItems.length
    ? tItems
        .slice(0, 4)
        .map((i) => `${i.title} (${BOOKING_STATUS_META[bookingStatusOf(i)].label})`)
        .join(' · ')
    : 'Nada marcado para amanhã.'
  const food = activities.filter((i) => countsAsTraining(i) || i.leaveTime || i.returnTime)

  const blocks: DailyBlock[] = [
    training,
    { kind: 'trabalho', key: key('trabalho'), title: 'Trabalho Fashion Finder · 30 min', emoji: '💻', minutes: 30, ...(work ? label(work) : {}), sub: work ? undefined : noWindow, parts: WORK_FOCUS, done: done('trabalho'), core: true },
    {
      kind: 'ingles',
      key: key('ingles'),
      title: 'Inglês individual · 30 min',
      emoji: '🗣️',
      minutes: 30,
      ...(english ? label(english) : {}),
      sub: ['Aula da escola não conta.', english ? undefined : noWindow].filter(Boolean).join(' '),
      parts: ENGLISH_PARTS,
      done: done('ingles'),
      core: true,
    },
    {
      kind: 'alimentacao',
      key: key('alimentacao'),
      title: 'Alimentação e hidratação',
      emoji: '🥗',
      sub: food.length ? `Água e lanche para ${food.map((i) => i.title).join(', ')}.` : 'Refeições de verdade e água ao longo do dia.',
      done: done('alimentacao'),
      core: false,
    },
    { kind: 'revisao', key: key('revisao'), title: 'Revisar reservas de amanhã', emoji: '🎟️', minutes: 15, ...(review ? label(review) : {}), sub: tLine, done: done('revisao'), core: false },
  ]
  blocks.sort((a, b) => (a.start ? hmToMinutes(a.start) : 9999) - (b.start ? hmToMinutes(b.start) : 9999))
  return { date, blocks, notes, done: blocks.filter((b) => b.done).length, total: blocks.length }
}

/** "07:00–08:00" / "07:00" / "sem horário". */
export function blockWhen(b: Pick<DailyBlock, 'start' | 'end'>): string {
  return b.start ? (b.end ? `${b.start}–${b.end}` : b.start) : 'sem horário'
}
