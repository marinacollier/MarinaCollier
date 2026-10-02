/**
 * Daily closing ("Dia encerrado 🌙") helpers.
 */
import { actions, getDB } from '@/data/store'
import { checkinFor, expensesBetween, isTaskDoneOn, modalityOf, sumCents, workoutsOn } from '@/data/selectors'
import type { DailyCheckIn, DateKey, DB } from '@/data/types'
import { toDateKey } from '@/lib/date'
import { prioritiesOf } from './priorities'

export const EMPTY_HABITS: DailyCheckIn['habits'] = {
  agua: 0,
  proteina: false,
  fruta: false,
  vegetais: false,
  refeicoesPlanejadas: false,
}

export function ensureCheckin(date: DateKey): DailyCheckIn {
  const existing = checkinFor(getDB(), date)
  if (existing) return existing
  return actions.create('checkins', { date, habits: { ...EMPTY_HABITS } })
}

export interface ClosingSummary {
  tasksDone: number
  workouts: { id: string; label: string; emoji: string }[]
  spentCents: number
  openPriorities: ReturnType<typeof prioritiesOf>
}

export function closingSummary(db: DB, date: DateKey): ClosingSummary {
  const oneOff = db.tasks.filter((t) => !t.recurrence && t.status === 'done' && !!t.completedAt && toDateKey(new Date(t.completedAt)) === date).length
  const recurring = db.tasks.filter((t) => t.recurrence && isTaskDoneOn(db, t, date)).length
  const workouts = workoutsOn(db, date)
    .filter((w) => w.status === 'feito' || w.status === 'adaptado')
    .map((w) => {
      const m = modalityOf(db, w.modality)
      return { id: w.id, label: w.title || m.label, emoji: m.emoji }
    })
  return {
    tasksDone: oneOff + recurring,
    workouts,
    spentCents: sumCents(expensesBetween(db, date, date)),
    openPriorities: prioritiesOf(db, date).filter((p) => !p.done),
  }
}

export const MOODS: { value: NonNullable<DailyCheckIn['closing']>['mood']; emoji: string; label: string }[] = [
  { value: 'bom', emoji: '😊', label: 'Bom' },
  { value: 'neutro', emoji: '😐', label: 'Ok' },
  { value: 'cansado', emoji: '😮‍💨', label: 'Cansativo' },
]
