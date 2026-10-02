import { beforeEach, describe, expect, it } from 'vitest'
import { createSeedContext, seedId } from '@/data/seed/context'
import { buildSeed } from '@/data/seed'
import { emptyDB } from '@/data/defaults'
import { getDB, useStore } from '@/data/store'
import type { DB, NutritionDayPlan, PlannedMeal, Workout } from '@/data/types'
import { dayPlanFor, strategyFor } from '@/data/fuel'
import { seedNutrition } from './seed'
import { PLAN_DOMINGO, PLAN_QUINTA, PLAN_SABADO, PLAN_SEGUNDA_E_QUARTA, PLAN_SEXTA, PLAN_TERCA } from './plans.data'
import { fuelStages, hasGuidance, previousDayMeals, toggleFuelDone, weekRows } from './logic'
import { buildNutritionReport, checkinSummary } from './report'
import { savePostCheckin, toggleFuelMark } from './mutations'
import { durationRange } from './format'
import { sortComposition } from './EvolutionPage'

const seed = seedNutrition(createSeedContext('2026-10-02'))
const plans = seed.nutritionDayPlans!
const byName = (n: string) => plans.find((p) => p.name === n)!
const meal = (p: PlannedMeal[], time: string) => p.find((m) => m.time === time)!
const food = (m: PlannedMeal, f: string) => m.items.find((i) => i.food === f)!

describe('nutrition seed — faithful to the nutritionist PDFs', () => {
  it('has one record per prescribed day with the right day type / weekday', () => {
    const map = Object.fromEntries(plans.map((p) => [p.name, [p.dayType, p.weekdays]]))
    expect(map).toEqual({
      Segunda: ['moderado', [1]],
      Terça: ['moderado', [2]],
      Quarta: ['forca_pesada', [3]],
      Quinta: ['prep_longo', [4]],
      Sexta: ['corrida_longa', [5]],
      Sábado: ['prep_longo', [6]],
      Domingo: ['pedal_longo', [0]],
    })
    for (const p of plans) {
      expect(p.source).toBe('nutricionista')
      expect(p.sourceName).toBe('João Monteiro — Clínica JMN (CRN 30844)')
      expect(p.prescribedAt).toBe('2026-10-02')
      expect(p.active).toBe(true)
      expect(p.id.startsWith('seed:nutrition:')).toBe(true)
    }
    expect(byName('Segunda').meals).toBe(byName('Quarta').meals)
    expect(byName('Segunda').notes).toMatch(/segunda e quarta/i)
  })

  it('keeps meal times, names and phases', () => {
    expect(PLAN_SEXTA.map((m) => [m.time, m.name, m.phase])).toEqual([
      ['05:00', 'Pré-treino', 'pre'],
      ['06:40', 'Intra-treino', 'intra'],
      ['08:00', 'Café da manhã (pós-treino)', 'pos'],
      ['12:00', 'Almoço', 'refeicao'],
      ['16:00', 'Lanche da tarde', 'refeicao'],
      ['20:00', 'Jantar', 'refeicao'],
    ])
    expect(PLAN_SABADO.map((m) => m.phase)).toEqual(['refeicao', 'refeicao', 'refeicao', 'refeicao'])
    expect(PLAN_SABADO[0].name).toBe('Café da manhã')
    expect(PLAN_DOMINGO.filter((m) => m.phase === 'intra').map((m) => m.time)).toEqual(['06:40', '07:20'])
  })

  it('spot-checks foods, quantities and substitutions', () => {
    expect(food(meal(PLAN_TERCA, '05:00'), 'Café coado').qty).toBe('1 Xícara(s) chá (200ml)')
    expect(food(meal(PLAN_TERCA, '12:00'), 'Filet Mignon Suíno Assado').qty).toBe('1.6 Medalhão (162.5g)')
    expect(food(meal(PLAN_TERCA, '20:00'), 'Salada alface lisa, alface roxa, rúcula e sal').qty).toBe('À vontade')
    expect(food(meal(PLAN_SEXTA, '05:00'), 'Doce de leite cremoso').qty).toBe('4 Colher(es) café cheia(s) (32g)')
    expect(food(meal(PLAN_QUINTA, '05:00'), 'Doce de leite cremoso').qty).toBe('3 Colher(es) café cheia(s) (24g)')
    expect(food(meal(PLAN_SEXTA, '08:00'), 'Suco de laranja').substitutions).toEqual(['Suco de uva concentrado - 1 Copo(s) americano(s) pequeno(s) cheio(s) (165ml)'])
    expect(food(meal(PLAN_SEXTA, '06:40'), 'Gel - Endurance - Tangerina (Marca: Vitafor)')).toEqual({
      food: 'Gel - Endurance - Tangerina (Marca: Vitafor)',
      qty: '1 Sachê(s) (30g)',
      substitutions: ['Mel de abelha - 3 Colher(es) de sobremesa rasa(s) (27g)', 'Gatorade Laranja - 0.5 Unidade(s) (250ml)'],
    })
    expect(food(meal(PLAN_DOMINGO, '06:40'), 'Queijo canastra').qty).toBe('1 Fatia(s) média(s) (30g)')
    expect(food(meal(PLAN_SABADO, '16:00'), 'Banana prata').substitutions).toEqual([
      'Abacaxi - 4 fatia(s) pequena(s) (300g)',
      'Maçã Argentina - 2 unidade(s) pequena(s) (160g)',
      'Mamão papaia - 1 unidade(s) pequena(s) (270g)',
      'Morango - 20 unidade(s) (400g)',
    ])
    expect(food(meal(PLAN_QUINTA, '20:00'), 'Patinho Moido').substitutions?.length).toBe(8)
    expect(food(meal(PLAN_SEGUNDA_E_QUARTA, '20:00'), 'Batata inglesa sauté').substitutions?.[6]).toBe('Inhame (cará) cozido com sal - 2.5 Colher(es) de servir cheia(s) (155g)')
    // ligature normalized, spelling kept
    expect(JSON.stringify([PLAN_TERCA, PLAN_QUINTA, PLAN_SEXTA, PLAN_SABADO, PLAN_DOMINGO, PLAN_SEGUNDA_E_QUARTA])).not.toContain('ﬁ')
    expect(food(meal(PLAN_TERCA, '20:00'), 'Filé de frango grelhado').substitutions).toContain('Camarão grelhdao - 12 unidade(s) média(s) (120g)')
  })

  it('keeps observations verbatim', () => {
    expect(meal(PLAN_SEXTA, '06:40').notes).toBe('Utilizar um carbo em Gel após 40 min de corrida continua')
    expect(meal(PLAN_DOMINGO, '07:20').notes).toBe('Utilizar um carbo em Gel após 40 min de corrida continua')
    expect(meal(PLAN_SEGUNDA_E_QUARTA, '05:00').notes).toBe('Opção 2\n. 1 café coado\n. 1 und carbo em gel (Vitafor ou Integral medica ou Dux) ou 1 und de gatorade')
  })

  it('derives strategies only from the plans', () => {
    const s = Object.fromEntries(seed.nutritionStrategies!.map((x) => [x.name, x]))
    expect(Object.keys(s)).toEqual(['Corrida longa', 'Pedal longo', 'Pernas — key session'])
    expect(s['Corrida longa'].linkedWorkoutTypes).toEqual(['long-run'])
    expect(s['Corrida longa'].previousDayInstructions).toMatch(/^Jantar do dia anterior conforme o plano de preparação \(quinta\)/)
    expect(s['Corrida longa'].previousDayInstructions).toContain('Patinho Moido — 2.3 bife(s) pequeno(s) (88g)')
    expect(s['Corrida longa'].duringWorkoutInstructions).toContain('Utilizar um carbo em Gel após 40 min de corrida continua')
    expect(s['Pedal longo'].linkedWorkoutTypes).toEqual(['long-ride', 'long-session'])
    expect(s['Pedal longo'].duringWorkoutInstructions).toContain('Pão de queijo assado — 2 Unidade(s) média(s) (40g)')
    expect(s['Pedal longo'].duringWorkoutInstructions).toContain('07:20')
    expect(s['Pedal longo'].previousDayInstructions).toContain('Macarrão cozido — 3.5 Colher(es) de servir cheia(s) (175g)')
    expect(s['Pernas — key session'].preWorkoutInstructions).toContain('Opção 2')
    for (const x of Object.values(s)) expect(x.source).toBe('nutricionista')
  })

  it('body composition is reference only', () => {
    const [cur, hist] = seed.bodyComposition!
    expect(cur).toMatchObject({ date: '2026-10-02', label: 'Referência atual', weightKg: 69.5, bodyFatPct: 21.7, fatMassKg: 15.1, skeletalMuscleKg: 30.6 })
    expect(hist).toMatchObject({ label: 'Referência 2022', weightKg: 65.7, bodyFatPct: 13.8, skeletalMuscleKg: 32.1, historical: true })
    expect(hist.date).toBeUndefined()
    expect(seed).not.toHaveProperty('goals')
    expect(sortComposition([hist, cur])[0]).toBe(cur)
  })

  it('never mentions calories', () => {
    expect(JSON.stringify(seed)).not.toMatch(/kcal|caloria/i)
    expect(seedId('nutrition', 'plano-sexta')).toBe('seed:nutrition:plano-sexta')
  })

  it('is wired into the full seed', () => {
    const db = buildSeed('2026-10-02')
    expect(db.nutritionDayPlans).toHaveLength(7)
    expect(db.nutritionStrategies.length).toBeGreaterThanOrEqual(3)
  })
})

// ─── Fuel logic ─────────────────────────────────────────────────────────────

const meta = { createdAt: '', updatedAt: '' }
const wk = (id: string, date: string, modality: string, extra: Partial<Workout> = {}): Workout => ({ ...meta, id, date, modality, status: 'planejado', order: 0, ...extra })

function fixture(): DB {
  const db = emptyDB()
  db.nutritionDayPlans = plans as NutritionDayPlan[]
  db.nutritionStrategies = seed.nutritionStrategies!
  db.bodyComposition = seed.bodyComposition!
  // week of 2026-09-28 (Mon) .. 2026-10-04 (Sun)
  db.workouts = [
    wk('swim', '2026-09-28', 'natacao', { time: '06:00', title: 'Natação endurance', loadCategory: 'moderada' }),
    wk('upper', '2026-09-29', 'musculacao', { time: '06:00', title: 'Upper + pliometria', loadCategory: 'moderada' }),
    wk('yoga', '2026-09-29', 'yoga', { time: '19:00', title: 'Yoga', loadCategory: 'leve' }),
    wk('legs', '2026-09-30', 'musculacao', { time: '06:00', title: 'Perna — key session', isKeySession: true, loadCategory: 'key', tags: ['pernas', 'key-session'] }),
    wk('swim2', '2026-10-01', 'natacao', { time: '06:00', title: 'Natação', loadCategory: 'moderada' }),
    wk('run', '2026-10-02', 'corrida', {
      time: '06:00',
      title: 'Long Run',
      plannedDurationMin: 60,
      plannedDurationMaxMin: 75,
      isKeySession: true,
      isLongSession: true,
      loadCategory: 'key',
      requiresPreviousDayPrep: true,
      requiresPreWorkout: true,
      requiresIntraWorkout: true,
      requiresPostWorkout: true,
      tags: ['long-run', 'key-session'],
      status: 'feito',
      durationMin: 70,
      fuelDone: ['pre', 'pos'],
      postCheckin: { energia: 'ok', nutricao: 'funcionou', at: '' },
    }),
    wk('ride', '2026-10-04', 'bike', {
      time: '06:00',
      title: 'Long Ride',
      plannedDurationMin: 120,
      plannedDurationMaxMin: 180,
      isKeySession: true,
      isLongSession: true,
      requiresPreviousDayPrep: true,
      requiresPreWorkout: true,
      requiresIntraWorkout: true,
      requiresPostWorkout: true,
      tags: ['long-ride', 'long-session', 'key-session'],
    }),
  ]
  db.meals = [{ ...meta, id: 'm1', date: '2026-10-01', slot: 'jantar', description: 'Macarrão com patinho', done: true, tags: [], purpose: 'pre_long_run', workoutId: 'run' }]
  return db
}

describe('fuel sheet logic', () => {
  it('long run: ONTEM → PRÉ → TREINO → INTRA → PÓS with prescribed meals', () => {
    const db = fixture()
    const run = db.workouts.find((w) => w.id === 'run')!
    const stages = fuelStages(db, run)
    expect(stages.map((s) => s.phase)).toEqual(['ontem', 'pre', 'treino', 'intra', 'pos'])
    expect(stages[0].plan?.name).toBe('Quinta')
    expect(stages[0].meals.map((m) => m.name)).toEqual(['Jantar'])
    expect(stages[1].meals[0].time).toBe('05:00')
    expect(stages[3].meals[0].items[0].food).toMatch(/^Gel/)
    expect(stages[4].meals[0].name).toBe('Café da manhã (pós-treino)')
    expect(stages[1].text).toContain('Pré-treino')
    expect(hasGuidance(stages)).toBe(true)
  })

  it('long ride: previous day = Saturday dinner, two intra moments', () => {
    const db = fixture()
    const stages = fuelStages(db, db.workouts.find((w) => w.id === 'ride')!)
    expect(stages[0].plan?.name).toBe('Sábado')
    expect(stages.find((s) => s.phase === 'intra')!.meals.map((m) => m.time)).toEqual(['06:40', '07:20'])
  })

  it('light session without flags: PRÉ → TREINO → PÓS', () => {
    const db = fixture()
    const stages = fuelStages(db, db.workouts.find((w) => w.id === 'upper')!)
    expect(stages.map((s) => s.phase)).toEqual(['pre', 'treino', 'pos'])
    expect(stages[0].meals[0].time).toBe('05:00') // Terça plan
  })

  it('no plan and no strategy → nothing invented', () => {
    const db = fixture()
    db.nutritionDayPlans = []
    db.nutritionStrategies = []
    expect(hasGuidance(fuelStages(db, db.workouts[0]))).toBe(false)
    expect(previousDayMeals(undefined)).toEqual([])
  })

  it('toggles execution marks', () => {
    expect(toggleFuelDone(undefined, 'pre')).toEqual(['pre'])
    expect(toggleFuelDone(['pre', 'pos'], 'pre')).toEqual(['pos'])
  })

  it('week rows come from the trainings (🔥 only for key, PREP before long sessions)', () => {
    const db = fixture()
    const rows = weekRows(db, '2026-10-02')
    expect(rows.map((r) => `${r.short} ${r.key ? '🔥 ' : ''}${r.label}`)).toEqual([
      'SEG Natação endurance',
      'TER Upper + pliometria',
      'QUA 🔥 Perna — key session',
      'QUI Natação + PREP corrida',
      'SEX 🔥 Long Run',
      'SÁB PREP pedal',
      'DOM 🔥 Long Ride',
    ])
    expect(rows.map((r) => r.plan?.name)).toEqual(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'])
  })

  it('moving the long run to Saturday moves its plan and prep', () => {
    const db = fixture()
    db.workouts = db.workouts.filter((w) => w.id !== 'ride').map((w) => (w.id === 'run' ? { ...w, date: '2026-10-03' } : w))
    expect(dayPlanFor(db, '2026-10-03')?.name).toBe('Sexta')
    expect(dayPlanFor(db, '2026-10-02')?.dayType).toBe('prep_longo')
    expect(strategyFor(db, db.workouts.find((w) => w.id === 'run')!)?.name).toBe('Corrida longa')
  })

  it('formats duration ranges', () => {
    expect(durationRange({ plannedDurationMin: 60, plannedDurationMaxMin: 75 })).toBe('60–75 min')
    expect(durationRange({ plannedDurationMin: 120, plannedDurationMaxMin: 180 })).toBe('2–3h')
    expect(durationRange({ plannedDurationMin: 45 })).toBe('45 min')
    expect(durationRange({})).toBeUndefined()
  })
})

describe('report for the nutritionist', () => {
  it('lists facts of the last 4 weeks, no diagnosis, no calories', () => {
    const text = buildNutritionReport(fixture(), '2026-10-02')
    expect(text).toContain('Período: 05/09/2026 a 02/10/2026')
    expect(text).toContain('sex 02/10 — Long Run · 06:00 · 70 min · planejado 60–75 min')
    expect(text).toContain('Marcado: pré, pós')
    expect(text).toContain('Como foi: energia ok · nutrição funcionou')
    expect(text).toContain('qui 01/10 jantar (antes da corrida longa · Long Run): Macarrão com patinho')
    expect(text).toContain('02/10/2026 — Referência atual: peso 69,5 kg · gordura 21,7%')
    expect(text).toContain('Referência 2022 (histórico)')
    expect(text).not.toMatch(/kcal|caloria|meta|falhou/i)
    expect(text).not.toContain('Long Ride') // outside the period (future)
  })

  it('summarises check-ins', () => {
    expect(checkinSummary(undefined)).toBeUndefined()
    expect(checkinSummary({ treino: 'mais_dificil', recuperacao: 'atencao', at: '' })).toBe('treino mais difícil · recuperação: atenção')
  })
})

describe('check-in and fuel marks write to the workout', () => {
  beforeEach(() => useStore.setState({ db: fixture() }))

  it('saves answers one tap at a time', () => {
    savePostCheckin('ride', { energia: 'otima' })
    savePostCheckin('ride', { nutricao: 'ajustar', nota: 'gel cedo demais' })
    const c = getDB().workouts.find((w) => w.id === 'ride')!.postCheckin!
    expect(c).toMatchObject({ energia: 'otima', nutricao: 'ajustar', nota: 'gel cedo demais' })
    expect(c.at).toBeTruthy()
  })

  it('toggles fuel marks', () => {
    expect(toggleFuelMark('ride', 'intra')).toBe(true)
    expect(getDB().workouts.find((w) => w.id === 'ride')!.fuelDone).toEqual(['intra'])
    expect(toggleFuelMark('ride', 'intra')).toBe(false)
    expect(getDB().workouts.find((w) => w.id === 'ride')!.fuelDone).toEqual([])
  })
})
