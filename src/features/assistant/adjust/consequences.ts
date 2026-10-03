/**
 * What else changes when a session changes — computed by the real engines (data/fuel.ts,
 * data/planning.ts) on a simulated copy of the DB. Diet follows the training: Mari only reports
 * which prescribed day plan / registered strategy applies after the change. She never invents food.
 */
import { DAY_TYPE_LABEL, dayPlanFor, dayTrainingContext, durationReviewSuggested, strategyFor } from '@/data/fuel'
import { conflictsOn, findModality, type Conflict } from '@/data/planning'
import type { DateKey, DB, NutritionDayType, Workout } from '@/data/types'
import { addDays } from '@/lib/date'
import { capitalize, dayLabel } from '../agents/common'
import type { PlanChange } from './types'

export function changeToWorkout(c: PlanChange): Workout {
  const base = c.before && c.kind !== 'create' ? c.before : undefined
  return {
    createdAt: base?.createdAt ?? '',
    updatedAt: base?.updatedAt ?? '',
    ...c.after,
    ...(c.kind === 'remove' ? { status: 'pulado' as const } : {}),
  } as Workout
}

/** The DB as it would be after the changes (nothing is written). */
export function simulate(db: DB, changes: PlanChange[]): DB {
  let workouts = [...db.workouts]
  for (const c of changes) {
    const w = changeToWorkout(c)
    if (c.kind === 'create') workouts = [...workouts.filter((x) => x.id !== w.id), w]
    else workouts = workouts.map((x) => (x.id === w.id ? w : x))
  }
  return { ...db, workouts }
}

const TYPE_PHRASE: Record<NutritionDayType, string> = {
  descanso: 'dia de descanso',
  leve: 'dia de treino leve',
  moderado: 'dia de treino moderado',
  forca_pesada: 'dia de força pesada',
  corrida_longa: 'dia de corrida longa',
  pedal_longo: 'dia de pedal longo',
  prep_longo: 'PREP (véspera de treino longo)',
}

function wLabel(db: DB, w: Workout): string {
  const m = findModality(db.profile, w.modality)
  return w.title || m?.label || w.modality
}

/** Days whose context can change: every touched date, the day before and the day after. */
export function affectedDays(changes: PlanChange[], today: DateKey): DateKey[] {
  const set = new Set<DateKey>()
  for (const c of changes) {
    for (const d of [c.before?.date, c.after.date]) {
      if (!d) continue
      for (const x of [addDays(d, -1), d, addDays(d, 1)]) if (x >= today) set.add(x)
    }
  }
  return [...set].sort()
}

export interface ConsequenceResult {
  consequences: string[]
  warnings: Conflict[]
  offerStrategy: boolean
}

export function consequencesOf(db: DB, changes: PlanChange[], today: DateKey): ConsequenceResult {
  const after = simulate(db, changes)
  const out: string[] = []
  const day = (d: DateKey) => capitalize(dayLabel(d, today))

  for (const d of affectedDays(changes, today)) {
    const a = dayTrainingContext(db, d)
    const b = dayTrainingContext(after, d)
    if (a.dayType !== b.dayType) {
      const plan = dayPlanFor(after, d)
      const planLine = plan ? `plano do nutri: “${plan.name}”` : `sem plano cadastrado para ${DAY_TYPE_LABEL[b.dayType].toLowerCase()}`
      if (a.dayType === 'prep_longo' && b.dayType !== 'prep_longo')
        out.push(`${day(d)} deixa de ser PREP → ${TYPE_PHRASE[b.dayType]} · ${planLine}`)
      else if (b.dayType === 'prep_longo')
        out.push(`${day(d)} vira PREP${b.prepFor ? ` (véspera de ${wLabel(after, b.prepFor).toLowerCase()})` : ''} · ${planLine}`)
      else out.push(`${day(d)} deixa de ser ${TYPE_PHRASE[a.dayType]} → vira ${TYPE_PHRASE[b.dayType]} · ${planLine}`)
    } else if (a.dayType !== 'prep_longo' && b.prepFor && !a.prepFor) {
      out.push(`${day(d)} vira véspera de ${wLabel(after, b.prepFor).toLowerCase()} — confira a estratégia de pré-treino`)
    } else if (a.prepFor && !b.prepFor && a.dayType === b.dayType) {
      out.push(`${day(d)} deixa de ser véspera de ${wLabel(db, a.prepFor).toLowerCase()}`)
    }
  }

  // Strategies travel with the training.
  let offerStrategy = false
  for (const c of changes) {
    if (c.implicit) continue
    const before = c.before
    const now = changeToWorkout(c)
    const sBefore = before ? strategyFor(db, before) : undefined
    const active = now.status !== 'pulado' && now.status !== 'descanso'
    const sAfter = active ? strategyFor(after, now) : undefined
    const what = findModality(after.profile, now.modality)?.label.toLowerCase() ?? now.modality
    if (sBefore && sAfter?.id === sBefore.id && before && before.date !== now.date)
      out.push(`A estratégia “${sBefore.name}” vai junto pra ${dayLabel(now.date, today)}`)
    else if (sBefore && sAfter?.id !== sBefore.id) {
      out.push(`A estratégia “${sBefore.name}” sai ${before && before.date === now.date ? 'do dia' : 'desse dia'}`)
      if (active && !sAfter) {
        out.push(`Nenhuma estratégia cadastrada para ${what} — quer cadastrar?`)
        offerStrategy = true
      }
    }
    if (sAfter && sAfter.id !== sBefore?.id) out.push(`Vale a estratégia “${sAfter.name}” pra esse treino`)
    if (!before && active && now.isKeySession && !sAfter) {
      out.push(`Nenhuma estratégia cadastrada para ${what} — quer cadastrar?`)
      offerStrategy = true
    }
    if (active && before && c.kind === 'update' && durationReviewSuggested(after, now))
      out.push('A duração mudou bastante — vale revisar a estratégia nutricional')
  }

  // New conflicts that involve the changed sessions.
  const ids = new Set(changes.map((c) => c.after.id))
  const warnings: Conflict[] = []
  const dates = [...new Set(changes.filter((c) => !c.implicit).map((c) => c.after.date))]
  for (const d of dates) {
    const existing = new Set(conflictsOn(db, d).map((c) => c.key))
    for (const c of conflictsOn(after, d)) if (!existing.has(c.key) && c.refs.some((r) => ids.has(r.id))) warnings.push(c)
  }
  return { consequences: [...new Set(out)], warnings, offerStrategy }
}
