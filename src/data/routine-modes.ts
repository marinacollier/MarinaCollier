/**
 * MODOS DE ROTINA + DIA BASE.
 *
 * Mode of a day (resolution lives in travel-mode.ts, next to the trip logic it extends):
 *   manual override (date inside it) > explicit period > trip day → 'viagem' > 'brasil'.
 * - 'viagem' / 'ferias': the São Paulo routine pauses (routines, recurring events, weekly template), no work base.
 * - 'transicao': recovery — no work base, the week template's workouts are light/optional (planType 'flexivel',
 *   never "missed"), routines in their Essential version.
 * - 'brasil': normal.
 *
 * Day blocks (`profile.dayPlan.blocks`): the editable base day, projected by the universal calendar as background.
 * Real things always win: a 'sugerido' block that overlaps a real timed entry is hidden for that day, and
 * neither 'base' nor 'sugerido' blocks ever create a conflict.
 *
 * Everything reads `db.profile` (all optional) — no profile config = exactly the previous behaviour.
 * Pure: (db, DateKey) → value. Dates are local DateKeys; `routineModeToday` is the only clock reader.
 */
import type { DateKey, DayBlock, DayBlockCategory, DB, Routine, RoutineMode, RoutineModesConfig, TimeHM, UserProfile } from './types'
import { SEED_IDS } from './seed/ids'
import { hmToMinutes, todayKey, weekday, weekDays } from '@/lib/date'
import { isTravelDay, routineModeInfo, routineModeOn, type RoutineModeInfo } from './travel-mode'

export { explicitModeOn, modeHasWorkBase, modePausesHome, routineModeInfo, routineModeOn } from './travel-mode'
export type { RoutineModeInfo, RoutineModeSource } from './travel-mode'

// ─── Labels ─────────────────────────────────────────────────────────────────

export const ROUTINE_MODE_META: Record<RoutineMode, { label: string; emoji: string; hint: string }> = {
  brasil: { label: 'Brasil', emoji: '🏠', hint: 'Rotina normal: trabalho, Milagre da Manhã completo, treinos da semana.' },
  transicao: { label: 'Transição', emoji: '🌱', hint: 'Recuperação: sem bloco de trabalho, rotinas na versão essencial, treinos leves e opcionais.' },
  viagem: { label: 'Viagem', emoji: '✈️', hint: 'Rotina de SP pausada: sem trabalho base, sem rotinas da casa, sem semana modelo.' },
  ferias: { label: 'Férias', emoji: '🌴', hint: 'Como viagem: rotina de SP pausada, sem trabalho base.' },
}

export const ROUTINE_MODE_ORDER: RoutineMode[] = ['brasil', 'transicao', 'viagem', 'ferias']

export const DAY_BLOCK_CATEGORY_META: Record<DayBlockCategory, { label: string; emoji: string }> = {
  ritual: { label: 'Ritual', emoji: '🕯️' },
  luna: { label: 'Luna', emoji: '🐾' },
  trabalho: { label: 'Trabalho', emoji: '💼' },
  almoco: { label: 'Almoço', emoji: '🍽️' },
  treino: { label: 'Treino', emoji: '🏃‍♀️' },
  estudo: { label: 'Estudo', emoji: '📚' },
  idiomas: { label: 'Idiomas', emoji: '🗣️' },
  faculdade: { label: 'Faculdade', emoji: '🎓' },
  criatividade: { label: 'Criatividade', emoji: '🎨' },
  pessoal: { label: 'Pessoal', emoji: '🌿' },
  descanso: { label: 'Descanso', emoji: '😴' },
}

export const DAY_BLOCK_CATEGORIES = Object.keys(DAY_BLOCK_CATEGORY_META) as DayBlockCategory[]

/** "Modo Transição até 16/11" / "Modo Viagem (automático) até 16/11". */
export function routineModeLine(info: RoutineModeInfo): string {
  const meta = ROUTINE_MODE_META[info.mode]
  const until = info.until ? ` até ${info.until.slice(8, 10)}/${info.until.slice(5, 7)}` : ''
  const why = info.source === 'manual' ? ' (manual)' : info.source === 'viagem' ? ` (automático · ${info.label ?? 'viagem'})` : info.source === 'periodo' && info.label ? ` · ${info.label}` : ''
  return `Modo ${meta.label}${why}${info.source === 'padrao' ? '' : until}`
}

// ─── Today, in the right zone ───────────────────────────────────────────────

function dateIn(timeZone: string, now: Date): DateKey | undefined {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return undefined
  }
}

/**
 * The mode of "today": today is first taken in the profile's zone; when that day is a 'viagem' day with a trip
 * zone, today is re-read in the trip's zone (Cape Town is a day ahead of São Paulo late at night).
 */
export function routineModeToday(db: Pick<DB, 'trips' | 'profile'>, now: Date = new Date()): RoutineModeInfo & { date: DateKey } {
  const home = dateIn(db.profile.timezone ?? 'America/Sao_Paulo', now) ?? todayKey(now)
  const first = routineModeInfo(db, home)
  const local = first.timeZone !== (db.profile.timezone ?? 'America/Sao_Paulo') ? dateIn(first.timeZone, now) : undefined
  if (!local || local === home) return { ...first, date: home }
  return { ...routineModeInfo(db, local), date: local }
}

// ─── Workouts on transition days ────────────────────────────────────────────

/** Transição: the week template proposes light, optional sessions (planType 'flexivel', never "missed"). */
export const isLightTrainingDay = (db: Pick<DB, 'trips' | 'profile'>, date: DateKey) => routineModeOn(db, date) === 'transicao'

// ─── Essential vs full routine ──────────────────────────────────────────────

export type AutoEssentialReason = 'transicao' | 'treino_cedo'


const isMorning = (r: Pick<Routine, 'id' | 'period'>) => r.id === SEED_IDS.routineMorning || r.period === 'manha'

/** First workout time of the day before 08:00 (real records first; the template's fixed lines stand in on an empty day). */
function earlyWorkout(db: DB, date: DateKey, before: number): TimeHM | undefined {
  const day = db.workouts.filter((w) => w.date === date)
  const times = day.length
    ? day.filter((w) => w.status !== 'pulado' && w.status !== 'descanso').map((w) => w.time)
    : isTravelDay(db, date)
      ? []
      : (() => {
          const week = new Set(weekDays(date))
          const used = new Set(db.workouts.filter((w) => w.templateId && week.has(w.date)).map((w) => w.templateId))
          return db.weekTemplate.filter((t) => t.active && t.choice === 'fixed' && t.weekday === weekday(date) && !used.has(t.id)).map((t) => t.time)
        })()
  return times.filter((t): t is TimeHM => !!t && hmToMinutes(t) < before).sort()[0]
}

/**
 * Why a routine goes Essential by itself that day (undefined = full). Her explicit choice of the day
 * (DailyCheckIn.routineModes) always wins over this; routine items are never deleted, only filtered.
 * - 'transicao': every routine that has an Essential version;
 * - 'treino_cedo': Milagre da Manhã on a day with a workout before 08:00 (`routineModes.essentialIfWorkoutBefore`),
 *   once `profile.routineModes` exists — no config keeps the previous behaviour.
 */
export function autoEssentialReason(db: DB, routine: Pick<Routine, 'id' | 'period' | 'hasEssential'>, date: DateKey): AutoEssentialReason | undefined {
  if (!routine.hasEssential) return undefined
  const mode = routineModeOn(db, date)
  if (mode === 'transicao') return 'transicao'
  if (mode !== 'brasil') return undefined // paused anyway
  // The early-workout rule belongs to the routine-modes setup: without it, the old gentle suggestion stays.
  const cfg = db.profile.routineModes
  const limit = cfg ? (cfg.essentialIfWorkoutBefore ?? '08:00') : ''
  if (limit && isMorning(routine) && earlyWorkout(db, date, hmToMinutes(limit))) return 'treino_cedo'
  return undefined
}

/** The routine's mode for the day: her explicit choice > automatic (transição / treino cedo) > completa. */
export function effectiveRoutineMode(db: DB, routine: Pick<Routine, 'id' | 'period' | 'hasEssential'>, date: DateKey, chosen?: 'completa' | 'essential'): 'completa' | 'essential' {
  if (!routine.hasEssential) return 'completa'
  if (chosen) return chosen
  return autoEssentialReason(db, routine, date) ? 'essential' : 'completa'
}

// ─── Day blocks ─────────────────────────────────────────────────────────────

export const blockModes = (b: Pick<DayBlock, 'modes'>): RoutineMode[] => (b.modes?.length ? b.modes : ['brasil'])

/** Valid block (times parse, start < end, at least one weekday). */
export function validBlock(b: DayBlock): boolean {
  if (!/^\d{2}:\d{2}$/.test(b.start) || !/^\d{2}:\d{2}$/.test(b.end)) return false
  return hmToMinutes(b.start) < hmToMinutes(b.end) && b.weekdays.length > 0 && !!b.title.trim()
}

/** Blocks of the base day on `date`: right weekday, the day's mode in the block's modes; sorted by start. */
export function dayBlocksOn(db: Pick<DB, 'trips' | 'profile'>, date: DateKey): DayBlock[] {
  const blocks = db.profile.dayPlan?.blocks
  if (!blocks?.length) return []
  const mode = routineModeOn(db, date)
  const wd = weekday(date)
  return blocks.filter((b) => validBlock(b) && b.weekdays.includes(wd) && blockModes(b).includes(mode)).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
}

// ─── Profile edits (pure; the UI saves them with actions.setProfile) ────────

type ModesProfile = Pick<UserProfile, 'routineModes'>

/** Manual mode from `from` (to `to`, or open-ended). */
export function withManualMode(p: ModesProfile, mode: RoutineMode, from: DateKey, to?: DateKey): RoutineModesConfig {
  return { periods: p.routineModes?.periods ?? [], manual: { mode, from, ...(to && to >= from ? { to } : {}) } }
}

/** "Voltar ao automático": drops the manual override (periods stay). Undefined when nothing is left. */
export function withoutManualMode(p: ModesProfile): RoutineModesConfig | undefined {
  const periods = p.routineModes?.periods ?? []
  return periods.length ? { periods } : undefined
}

export function upsertBlock(blocks: DayBlock[], b: DayBlock): DayBlock[] {
  return blocks.some((x) => x.id === b.id) ? blocks.map((x) => (x.id === b.id ? b : x)) : [...blocks, b]
}

export function removeBlock(blocks: DayBlock[], id: string): DayBlock[] {
  return blocks.filter((b) => b.id !== id)
}

