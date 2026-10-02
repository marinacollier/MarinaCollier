/**
 * "Resumo para o nutricionista" — a plain, copyable record of the last weeks.
 * Facts only (what was registered). No diagnosis, no scores, no calories.
 */
import type { DateKey, DB, FuelPhase, MealPurpose, PostWorkoutCheckin, Workout } from '@/data/types'
import { addDays, formatDayMonth, formatFullDate, WEEKDAY_SHORT, weekday } from '@/lib/date'
import { durationRange, SOURCE_LABEL, workoutTitle } from './format'

export const PURPOSE_LABEL: Record<MealPurpose, string> = {
  geral: 'geral',
  pre_treino: 'pré-treino',
  intra_treino: 'intra-treino',
  pos_treino: 'pós-treino',
  recovery: 'recuperação',
  pre_long_run: 'antes da corrida longa',
  post_long_run: 'depois da corrida longa',
  pre_long_ride: 'antes do pedal longo',
  post_long_ride: 'depois do pedal longo',
  prep_dia_anterior: 'preparação (dia anterior)',
}

const MEAL_SLOT: Record<string, string> = { cafe: 'café', lanche_manha: 'lanche da manhã', almoco: 'almoço', lanche_tarde: 'lanche da tarde', jantar: 'jantar', extra: 'extra' }

const CHECKIN_LABEL = {
  energia: { baixa: 'energia baixa', ok: 'energia ok', otima: 'energia ótima' },
  treino: { mais_facil: 'treino mais fácil', esperado: 'treino como esperado', mais_dificil: 'treino mais difícil' },
  nutricao: { funcionou: 'nutrição funcionou', ajustar: 'nutrição: ajustar', nao_usei: 'não usei a estratégia' },
  recuperacao: { boa: 'recuperação boa', atencao: 'recuperação: atenção' },
} as const

export function checkinSummary(c: PostWorkoutCheckin | undefined): string | undefined {
  if (!c) return undefined
  const parts = [
    c.energia && CHECKIN_LABEL.energia[c.energia],
    c.treino && CHECKIN_LABEL.treino[c.treino],
    c.nutricao && CHECKIN_LABEL.nutricao[c.nutricao],
    c.recuperacao && CHECKIN_LABEL.recuperacao[c.recuperacao],
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

const FUEL_SHORT: Record<FuelPhase, string> = { ontem: 'véspera', pre: 'pré', intra: 'intra', pos: 'pós' }

const day = (d: DateKey) => `${WEEKDAY_SHORT[weekday(d)].toLowerCase()} ${formatDayMonth(d)}`
const num = (n: number) => String(n).replace('.', ',')

function workoutLine(db: DB, w: Workout): string[] {
  const head = [`${day(w.date)} — ${workoutTitle(db.profile, w)}`]
  if (w.time) head.push(w.time)
  if (w.durationMin != null) head.push(`${w.durationMin} min`)
  const planned = durationRange(w)
  if (planned) head.push(`planejado ${planned}`)
  if (w.status !== 'feito') head.push(w.status)
  const lines = [`• ${head.join(' · ')}`]
  if (w.fuelDone?.length) lines.push(`  Marcado: ${w.fuelDone.map((p) => FUEL_SHORT[p]).join(', ')}`)
  const c = checkinSummary(w.postCheckin)
  if (c) lines.push(`  Como foi: ${c}`)
  if (w.postCheckin?.nota?.trim()) lines.push(`  Nota: ${w.postCheckin.nota.trim()}`)
  return lines
}

export function buildNutritionReport(db: DB, today: DateKey, weeks = 4): string {
  const from = addDays(today, -(weeks * 7 - 1))
  const inRange = (d?: DateKey) => !!d && d >= from && d <= today
  const out: string[] = ['Resumo para o nutricionista', `Período: ${formatFullDate(from)} a ${formatFullDate(today)} (últimas ${weeks} semanas)`, '']

  const workouts = db.workouts.filter((w) => inRange(w.date) && w.status !== 'descanso').sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
  const key = workouts.filter((w) => w.isKeySession || w.isLongSession)
  out.push('TREINOS PRINCIPAIS')
  if (key.length) for (const w of key) out.push(...workoutLine(db, w))
  else out.push('• nenhum treino principal registrado no período')

  const others = workouts.filter((w) => !key.includes(w) && (w.status === 'feito' || w.status === 'adaptado'))
  if (others.length) {
    out.push('', 'OUTROS TREINOS FEITOS')
    for (const w of others) out.push(...workoutLine(db, w))
  }

  const meals = db.meals
    .filter((m) => inRange(m.date) && ((m.purpose && m.purpose !== 'geral') || m.workoutId))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
  out.push('', 'REFEIÇÕES LIGADAS AOS TREINOS')
  if (meals.length)
    for (const m of meals) {
      const w = m.workoutId ? db.workouts.find((x) => x.id === m.workoutId) : undefined
      const why = [m.purpose && PURPOSE_LABEL[m.purpose], w && workoutTitle(db.profile, w)].filter(Boolean).join(' · ')
      out.push(`• ${day(m.date)} ${MEAL_SLOT[m.slot] ?? m.slot}${why ? ` (${why})` : ''}: ${m.description}`)
    }
  else out.push('• nenhuma refeição registrada com ligação a treino')

  const comps = [...db.bodyComposition].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  if (comps.length) {
    out.push('', 'COMPOSIÇÃO CORPORAL (registros)')
    for (const c of comps) {
      const vals = [
        c.weightKg != null && `peso ${num(c.weightKg)} kg`,
        c.bodyFatPct != null && `gordura ${num(c.bodyFatPct)}%`,
        c.fatMassKg != null && `massa de gordura ${num(c.fatMassKg)} kg`,
        c.skeletalMuscleKg != null && `massa muscular esquelética ${num(c.skeletalMuscleKg)} kg`,
      ].filter(Boolean)
      const name = [c.date && formatFullDate(c.date), c.label].filter(Boolean).join(' — ')
      out.push(`• ${name}${c.historical ? ' (histórico)' : ''}: ${vals.join(' · ')}`)
    }
  }

  if (db.nutritionStrategies.length) {
    out.push('', 'ESTRATÉGIAS CADASTRADAS')
    for (const s of db.nutritionStrategies) out.push(`• ${s.name} (${SOURCE_LABEL[s.source]}${s.sourceName ? ` — ${s.sourceName}` : ''})`)
  }
  return out.join('\n')
}
