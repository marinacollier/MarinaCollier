/**
 * Where the priority engine's candidates come from. Pure: (db, ctx) → Candidate[] (unscored here: the engine
 * gives every candidate its contextual MoSCoW + score in ./engine.ts). Producers never invent facts: a field
 * she did not set stays undefined and the engine says "estimado" in the reasons.
 *
 *   tasks      open, non-archived, not done, not waiting; recurring ones only on the days they occur;
 *              project tasks only of live projects (concluído / pausado are left out)
 *   prep       "Preparar: X" for a real meeting in the next 48 h (meeting / event / trip item of kind reunião)
 *   study      the Learning Engine (src/features/learning/candidates.ts) — stub until it lands
 *   essentials Luna today, the minimum version of today's routines, meals still ahead, sleep — never ranked away
 */
import { ROUTES } from '@/app/routes'
import { calendarEntries, type CalendarEntry } from '../calendar/universal'
import { kindOfEntry } from '../calendar/kind'
import { dayBlocksOn } from '../routine-modes'
import { isCareerQuota, isTaskDoneOn, petTasksDue, routineItemsFor } from '../selectors'
import { occurrenceFor, occursOn, lastDoneDate } from '@/lib/recurrence'
import { addDays, diffDays, hmToMinutes } from '@/lib/date'
import type { Area, DateKey, DayBlockCategory, DB, Project, Task } from '../types'
import type { Candidate, DayContext, Energy, LifeArea } from './contract'

// Study candidates come from the Learning Engine (all domains, not only languages).
import { studyCandidates } from '@/features/learning/candidates'
export { studyCandidates }

/** A candidate before the engine scores it (moscow/score/reasons are filled by the engine). */
export type RawCandidate = Omit<Candidate, 'moscow' | 'score' | 'reasons'> & {
  reasons?: string[]
  moscow?: Candidate['moscow']
  score?: number
  /** The task behind it (tasks only). */
  task?: Task
  /** Prep for a real commitment: its start date. */
  prepFor?: DateKey
}

// ─── Small helpers ──────────────────────────────────────────────────────────

const AREA_TO_LIFE: Record<Area, LifeArea> = {
  pessoal: 'autocuidado',
  corpo: 'esportes',
  profissional: 'trabalho',
  estudo: 'estudos',
  financeiro: 'financas',
  viagem: 'social',
  conteudo: 'criatividade',
}
const CONTEXT_TO_LIFE: Partial<Record<NonNullable<Task['context']>, LifeArea>> = {
  trabalho: 'trabalho',
  carreira: 'trabalho',
  luna: 'luna',
  estudo: 'estudos',
  conteudo: 'criatividade',
  viagem: 'social',
  vida_real: 'financas',
}

export function lifeAreaOf(t: Task): LifeArea {
  return t.lifeArea ?? (t.context && CONTEXT_TO_LIFE[t.context]) ?? (t.area && AREA_TO_LIFE[t.area]) ?? (t.projectId ? 'trabalho' : 'autocuidado')
}

const EFFORT_MIN: Record<1 | 2 | 3, number> = { 1: 15, 2: 30, 3: 60 }
const DEFAULT_TASK_MIN = 30

/** Estimated minutes: her duration, else effort, else 30 (marked as estimate by the engine). */
export function taskMinutes(t: Task): {
  min: number
  max: number
  estimated: boolean
} {
  if (t.durationMin && t.durationMin > 0)
    return {
      min: Math.max(10, Math.round(t.durationMin / 2)),
      max: t.durationMin,
      estimated: false,
    }
  const max = t.effort ? EFFORT_MIN[t.effort] : DEFAULT_TASK_MIN
  return { min: Math.max(10, Math.round(max / 2)), max, estimated: true }
}

export function taskEnergy(t: Task, minutes: number): Energy {
  if (t.energyNeed) return t.energyNeed
  if (t.effort) return (t.effort + 1) as Energy
  return minutes <= 20 ? 2 : 3
}

const liveProject = (p: Project | undefined) => !p || (p.status !== 'concluido' && p.status !== 'pausado')

// ─── Tasks ──────────────────────────────────────────────────────────────────

/** Open tasks that could be done today (not scheduled at a fixed time — those are commitments). */
export function taskCandidates(db: DB, ctx: DayContext): RawCandidate[] {
  const date = ctx.date
  const soon = addDays(date, 2)
  const projects = new Map(db.projects.map((p) => [p.id, p]))
  const out: RawCandidate[] = []
  for (const t of db.tasks) {
    if (t.status === 'done' || t.status === 'archived' || t.status === 'waiting') continue
    if (isCareerQuota(t)) continue
    if (t.projectId && !liveProject(projects.get(t.projectId))) continue
    if (t.recurrence) {
      if (!occursOn(t.recurrence, date, lastDoneDate(db.occurrences, 'task', t.id)) || isTaskDoneOn(db, t, date)) continue
    } else if (t.date && t.date > date && !(t.dueDate && t.dueDate <= soon)) continue
    // A task at a fixed time today is already in the calendar (and in the busy time).
    if (t.time && (t.date === date || t.recurrence)) continue
    const m = taskMinutes(t)
    out.push({
      key: `task:${t.id}`,
      title: t.title,
      area: lifeAreaOf(t),
      minMin: m.min,
      maxMin: m.max,
      energyNeed: taskEnergy(t, m.max),
      nextStep: t.nextStep,
      deadline: t.dueDate,
      contributesTo: [...(t.goalIds ?? []), ...(t.goalId ? [t.goalId] : []), ...(t.projectId ? [t.projectId] : [])],
      open: { kind: 'task', id: t.id },
      task: t,
      reasons: m.estimated ? ['Tempo estimado (sem duração definida)'] : [],
    })
  }
  return out
}

// ─── Prep for real commitments ──────────────────────────────────────────────

const PREP_HOURS = 48

/** "Preparar: X" for each real meeting starting in the next 48 h (from now). */
export function prepCandidates(db: DB, ctx: DayContext, entries?: CalendarEntry[]): RawCandidate[] {
  const list = entries ?? calendarEntries(db, ctx.date, addDays(ctx.date, 2), { today: ctx.date })
  const nowAbs = hmToMinutes(ctx.now)
  const out: RawCandidate[] = []
  const seen = new Set<string>()
  for (const e of list) {
    if (e.base || e.suggested || e.optional || e.status === 'cancelado' || e.status === 'feito') continue
    if (e.sourceType === 'taskDeadline' || e.sourceType === 'dayBlock' || e.sourceType === 'work') continue
    if (kindOfEntry(db, e) !== 'reuniao') continue
    const day = diffDays(ctx.date, e.startAt.date)
    const start = day * 1440 + (e.startAt.time ? hmToMinutes(e.startAt.time) : 9 * 60)
    if (start < nowAbs || start - nowAbs > PREP_HOURS * 60) continue
    const key = `prep:${e.sourceType}:${e.sourceId}`
    if (seen.has(key)) continue
    seen.add(key)
    const when = day === 0 ? `hoje${e.startAt.time ? ` às ${e.startAt.time}` : ''}` : day === 1 ? `amanhã${e.startAt.time ? ` às ${e.startAt.time}` : ''}` : `em ${day} dias`
    out.push({
      key,
      title: `Preparar: ${e.title}`,
      area: e.category === 'trabalho' ? 'trabalho' : e.category === 'estudo' ? 'estudos' : 'social',
      minMin: 15,
      maxMin: 30,
      energyNeed: 3,
      deadline: e.startAt.date,
      prepFor: e.startAt.date,
      nextStep: e.nextAction ?? 'Rever a pauta e anotar 3 pontos',
      open: { kind: 'route', to: e.open.module?.route ?? ROUTES.agenda },
      reasons: [`Compromisso real ${when}`],
    })
  }
  return out
}

// ─── Essentials ─────────────────────────────────────────────────────────────

/** Base-day categories that are essentials (busy time in capacity, never a suggestion to skip). */
export const ESSENTIAL_BLOCKS: ReadonlySet<DayBlockCategory> = new Set(['ritual', 'luna', 'almoco', 'descanso'])

const LUNA_MIN: Partial<Record<string, number>> = {
  passeio: 30,
  alimentacao: 10,
}
const MEALS: {
  id: string
  title: string
  until: number
  min: number
  block?: DayBlockCategory
}[] = [
  {
    id: 'almoco',
    title: 'Almoço com calma',
    until: 14 * 60,
    min: 45,
    block: 'almoco',
  },
  { id: 'jantar', title: 'Jantar', until: 21 * 60, min: 40 },
]

export interface Essentials {
  candidates: Candidate[]
  /** Minutes to keep for essentials that are not already busy time in the calendar. */
  reserveMin: number
}

function essential(key: string, title: string, area: LifeArea, minutes: number, reason: string, open?: Candidate['open']): Candidate {
  return {
    key,
    title,
    area,
    minMin: minutes,
    maxMin: minutes,
    energyNeed: 1,
    moscow: 'must',
    score: 100,
    reasons: [reason],
    essential: true,
    open,
  }
}

/** Luna today, today's routines in their minimum version, meals still ahead and sleep. */
export function essentialsFor(db: DB, date: DateKey, nowMin: number): Essentials {
  const blocks = new Set(
    dayBlocksOn(db, date)
      .filter((b) => b.kind === 'base' && ESSENTIAL_BLOCKS.has(b.category))
      .map((b) => b.category),
  )
  const out: Candidate[] = []
  let reserve = 0

  // Luna (pauses on trip days inside petTasksDue).
  for (const p of petTasksDue(db, date)) {
    if (occurrenceFor(db.occurrences, 'petTask', p.id, date)) continue
    const min = LUNA_MIN[p.category] ?? 10
    out.push(essential(`luna:${p.id}`, p.title, 'luna', min, 'Cuidado da Luna de hoje', { kind: 'route', to: ROUTES.luna }))
    if (!blocks.has('luna')) reserve += min
  }

  // Routines still ahead today, minimum version (essential items when the routine has them).
  const dayPart = nowMin < 11 * 60 ? 0 : nowMin < 18 * 60 ? 1 : 2
  const PART: Record<string, number> = {
    manha: 0,
    trabalho: 1,
    dia: 1,
    noite: 2,
  }
  for (const r of db.routines) {
    if (!r.active || (PART[r.period] ?? 1) < dayPart) continue
    const items = routineItemsFor(db, r.id, date).filter((i) => !i.optional && (!r.hasEssential || i.essential))
    const left = items.filter((i) => occurrenceFor(db.occurrences, 'routineItem', i.id, date)?.status !== 'done')
    if (!left.length) continue
    const min = Math.min(
      45,
      Math.max(
        10,
        left.reduce((s, i) => s + (i.durationMin ?? 5), 0),
      ),
    )
    const label = r.hasEssential ? `${r.name} (${r.essentialName ?? 'versão essencial'})` : r.name
    out.push(essential(`routine:${r.id}`, label, 'autocuidado', min, 'Rotina mínima do dia', { kind: 'routine', id: r.id }))
    if (!blocks.has('ritual')) reserve += min
  }

  // Meals still ahead.
  for (const m of MEALS) {
    if (nowMin >= m.until) continue
    out.push(essential(`meal:${m.id}`, m.title, 'autocuidado', m.min, 'Comer bem faz parte do dia'))
    if (!m.block || !blocks.has(m.block)) reserve += m.min
  }

  // Sleep: the end of the day, never a slot to fill.
  out.push(essential('sleep', `Dormir às ${db.profile.rhythm?.sleepTime ?? '23:00'}`, 'autocuidado', 0, 'Sono é inegociável'))
  return { candidates: out, reserveMin: reserve }
}

/** Every non-essential candidate of the day (tasks, prep, study). */
export function gatherCandidates(db: DB, ctx: DayContext, entries?: CalendarEntry[]): RawCandidate[] {
  const tasks = taskCandidates(db, ctx)
  const prep = prepCandidates(db, ctx, entries)
  const study = studyCandidates(db, ctx).map((c): RawCandidate => ({ ...c }))
  return [...prep, ...tasks, ...study]
}
