/**
 * "Lumos controla o dia" — Marina's exact sentences against the real life seed (today = Saturday
 * 2026-10-03 in the seed context). Preview → apply → undo through the real store.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { seedId } from '@/data/seed/context'
import { getDB, useStore } from '@/data/store'
import { dayTimeline, findEntry } from '@/data/timeline'
import type { CalendarEvent, DB, RoutineItem } from '@/data/types'
import { EXAMPLE_QUESTIONS } from './chief'
import { applyPlan, undoPlan } from './adjust/apply'
import type { ChangePlan } from './adjust/types'
import { planDay, planWake, taskTitleFrom } from './day/plan'
import { understand } from './router'

const TODAY = '2026-10-03' // Saturday
const SUNDAY = '2026-10-04'
const MONDAY = '2026-10-05'
const leitura = { type: 'routineItem' as const, id: seedId('today', 'milagre-leitura') }
const meditacao = { type: 'routineItem' as const, id: seedId('today', 'milagre-meditacao') }

/** The seed has no timed English class (her calendar wins) and no shower item — add them like she would. */
function life(): DB {
  const db = buildSeed(TODAY)
  const ingles: CalendarEvent = {
    id: 'ev-ingles',
    createdAt: '',
    updatedAt: '',
    sourceId: db.events[0].sourceId,
    title: 'Inglês',
    date: '2026-09-28',
    startTime: '19:00',
    endTime: '20:00',
    allDay: false,
    kind: 'estudo',
    recurrence: { kind: 'weekly', weekdays: [0, 4] },
  }
  const banho: RoutineItem = {
    id: 'banho',
    createdAt: '',
    updatedAt: '',
    routineId: db.routines[0].id,
    title: 'Banho',
    recurrence: { kind: 'daily' },
    order: 8.5,
    active: true,
    durationMin: 15,
  }
  return { ...db, events: [...db.events, ingles], routineItems: [...db.routineItems, banho] }
}

const start = (date: string, ref: { type: 'routineItem' | 'event' | 'planMeal' | 'task'; id: string }) => findEntry(dayTimeline(getDB(), date), ref)

function adjust(text: string, today = TODAY, minutes = 8 * 60): ChangePlan {
  const t = understand(getDB(), text, today, minutes)
  expect(t.kind, text).toBe('adjust')
  return (t as { plan: ChangePlan }).plan
}

beforeEach(() => {
  useStore.setState({ db: life(), hydrated: true })
})

describe('schedule by conversation', () => {
  it('"amanhã coloca minha leitura às 5h30" → that day only, by Lumos, undoable', () => {
    const p = adjust('amanhã coloca minha leitura às 5h30')
    expect(p.doneTitle).toMatch(/Leitura da manhã de amanhã às 05:30/)
    expect(p.dayRows?.find((r) => r.title === 'Leitura da manhã')).toMatchObject({ from: '05:10', to: '05:30', primary: true })
    const snap = applyPlan(p)
    expect(start(SUNDAY, leitura)?.start).toBe('05:30')
    expect(start(MONDAY, leitura)?.start).toBe('05:10')
    expect(getDB().scheduleOverrides.every((o) => o.by === 'lumos')).toBe(true)
    undoPlan(snap)
    expect(start(SUNDAY, leitura)?.start).toBe('05:10')
    expect(getDB().scheduleOverrides).toHaveLength(0)
  })

  it('"amanhã coloca minha leitura às 5h10" → already there, nothing to confirm', () => {
    const p = adjust('amanhã coloca minha leitura às 5h10')
    expect(p.scheduleOps).toBeUndefined()
    expect(p.summary).toMatch(/já está às 05:10/)
  })

  it('"joga meu banho pra depois da natação" → moveAfter on the first day with both', () => {
    const p = adjust('joga meu banho pra depois da natação')
    expect(p.dayDate).toBe(MONDAY)
    expect(p.doneTitle).toMatch(/Banho vai pra 07:00, depois de natação endurance/)
    const snap = applyPlan(p)
    expect(start(MONDAY, { type: 'routineItem', id: 'banho' })?.start).toBe('07:00')
    undoPlan(snap)
  })

  it('"amanhã quero acordar 5h30" → the morning routine slides', () => {
    const p = adjust('amanhã quero acordar 5h30')
    applyPlan(p)
    expect(start(SUNDAY, { type: 'routineItem', id: seedId('today', 'milagre-despertar') })?.start).toBe('05:30')
    expect(start(TODAY, { type: 'routineItem', id: seedId('today', 'milagre-despertar') })?.start).toBe('04:40')
  })

  it('"terça não faço meditação de manhã" → next Tuesday only, the default stays', () => {
    const p = adjust('terça não faço meditação de manhã')
    expect(p.doneTitle).toBe('Meditação de terça cancelada ✓ Seu horário das 5h20 ficou livre.')
    applyPlan(p)
    expect(start('2026-10-06', meditacao)?.status).toBe('cancelled')
    expect(start('2026-10-13', meditacao)?.status).toBe('pending')
    expect(getDB().routineItems.find((i) => i.id === meditacao.id)?.active).toBe(true)
  })

  it('"nesta quinta yoga às 20:00" → that Thursday only (a dated session)', () => {
    const p = adjust('nesta quinta yoga às 20:00')
    expect(p.summary).toBe('Quinta: + 🧘‍♀️ Yoga às 20:00')
  })

  it('"amanhã cancelei meu inglês" → found on the timeline, cancelled, time freed, undo', () => {
    const p = adjust('amanhã cancelei meu inglês')
    expect(p.doneTitle).toBe('Inglês de amanhã cancelado ✓ Seu horário das 19h ficou livre.')
    expect(p.dayRows).toEqual(expect.arrayContaining([expect.objectContaining({ state: 'cancelled', title: 'Inglês' }), expect.objectContaining({ state: 'free', from: '19:00', to: '20:00' })]))
    const snap = applyPlan(p)
    expect(findEntry(dayTimeline(getDB(), SUNDAY), { type: 'event', id: 'ev-ingles' })).toBeUndefined()
    expect(findEntry(dayTimeline(getDB(), '2026-10-08'), { type: 'event', id: 'ev-ingles' })?.start).toBe('19:00')
    undoPlan(snap)
    expect(findEntry(dayTimeline(getDB(), SUNDAY), { type: 'event', id: 'ev-ingles' })?.start).toBe('19:00')
  })

  it('a study alias finds it: "inglês" finds an event called Cambly', () => {
    useStore.setState({ db: { ...getDB(), events: getDB().events.map((e) => (e.id === 'ev-ingles' ? { ...e, title: 'Cambly' } : e)) } })
    const p = adjust('amanhã cancelei meu inglês')
    expect(p.doneTitle).toMatch(/^Cambly de amanhã cancelado/)
  })

  it('cancelling also takes the prep that depends on it', () => {
    const db = getDB()
    const prep: RoutineItem = { id: 'prep-ingles', createdAt: '', updatedAt: '', routineId: db.routines[1].id, title: 'Separar fone', recurrence: { kind: 'daily' }, order: -1, active: true, durationMin: 5, dependsOn: ['ev-ingles'] }
    useStore.setState({ db: { ...db, routineItems: [...db.routineItems, prep] } })
    const p = adjust('amanhã cancelei meu inglês')
    expect(p.doneTitle).toMatch(/Tirei separar fone junto/)
  })

  it('not on that day → asks with the days where it is (never acts silently)', () => {
    const p = adjust('sexta cancelei meu inglês')
    expect(p.needsChoice?.question).toMatch(/Na sexta não tem “inglês”/)
    expect(p.needsChoice?.options.map((o) => o.label)).toEqual([expect.stringMatching(/Inglês · 19:00 · amanhã/), expect.stringMatching(/Inglês · 19:00 · quinta/)])
  })

  it('ambiguous match → short question with options', () => {
    const p = adjust('amanhã tira a leitura')
    expect(p.needsChoice?.options).toHaveLength(2)
  })

  it('"acordei agora" → replan proposal with Aplicar, training kept', () => {
    useStore.setState({ db: life() })
    const p = planWake(getDB(), MONDAY, 5 * 60 + 12)
    expect(p.previewTitle).toBe('São 05:12. Seu treino continua às 06:00. Montei uma manhã curta pra você:')
    expect(p.confirmLabel).toBe('Aplicar')
    expect(p.dayRows?.[0]).toMatchObject({ to: '05:12' })
    expect(p.dayRows?.at(-1)).toMatchObject({ title: 'Natação endurance', state: 'kept' })
    expect(understand(getDB(), 'acordei agora.', MONDAY, 5 * 60 + 12).kind).toBe('adjust')
  })
})

describe('section 11 — one plan, both changes', () => {
  it('"Amanhã cancelei o inglês e vou correr às 18h" → cancel + run, one undo', () => {
    const p = adjust('Amanhã cancelei o inglês e vou correr às 18h')
    expect(p.changes.filter((c) => !c.implicit)).toHaveLength(1)
    expect(p.changes[0].after).toMatchObject({ modality: 'corrida', time: '18:00', date: SUNDAY })
    expect(p.doneTitle).toMatch(/Inglês de amanhã cancelado ✓/)
    expect(p.consequences.join(' ')).toMatch(/lanche da tarde às 16:00 antes e jantar às 20:00 depois/)
    const snap = applyPlan(p)
    expect(getDB().workouts.some((w) => w.date === SUNDAY && w.modality === 'corrida' && w.time === '18:00')).toBe(true)
    expect(findEntry(dayTimeline(getDB(), SUNDAY), { type: 'event', id: 'ev-ingles' })).toBeUndefined()
    undoPlan(snap)
    expect(getDB().workouts.some((w) => w.date === SUNDAY && w.modality === 'corrida')).toBe(false)
    expect(findEntry(dayTimeline(getDB(), SUNDAY), { type: 'event', id: 'ev-ingles' })).toBeDefined()
  })

  it('when the training itself moves, its pre/intra/pós plan meals move with it (by Lumos)', () => {
    const p = adjust('quinta cancelei o inglês e sexta vou correr às 18h')
    const meals = (p.scheduleOps ?? []).filter((o) => o.op === 'override' && o.ref.type === 'planMeal')
    expect(meals.map((o) => (o.op === 'override' ? o.patch.time : ''))).toEqual(['17:00', '18:40', '20:00'])
    expect(meals.every((o) => o.op === 'override' && o.by === 'lumos')).toBe(true)
    expect(p.consequences.join(' ')).toMatch(/colado no jantar/)
    expect(p.consequences.join(' ')).not.toMatch(/pule|compens/i)
  })
})

describe('checklists (section 13)', () => {
  it('"me lembra de levar o shaker amanhã às 7h" → a dated task with a time, undoable', () => {
    const p = adjust('me lembra de levar o shaker amanhã às 7h')
    expect(p.taskCreates?.[0]).toMatchObject({ title: 'Levar o shaker', date: SUNDAY, time: '07:00', context: 'geral' })
    const snap = applyPlan(p)
    const t = getDB().tasks.find((x) => x.title === 'Levar o shaker')!
    expect(start(SUNDAY, { type: 'task', id: t.id })?.start).toBe('07:00')
    // …and removable by conversation
    const rm = adjust('amanhã tira o shaker')
    applyPlan(rm)
    expect(start(SUNDAY, { type: 'task', id: t.id })?.status).toBe('cancelled')
    undoPlan(snap)
  })

  it('without a time → asks when (always with time), tied to a plan meal', () => {
    const p = adjust('me lembra de levar o shaker amanhã')
    expect(p.needsChoice?.question).toBe('Que horas eu coloco “Levar o shaker”?')
    expect(p.needsChoice?.options[0].plan.taskCreates?.[0].origin?.type).toBe('meal')
  })

  it('titles keep her words', () => {
    expect(taskTitleFrom('me lembra de pegar o gel amanhã às 5h50')).toBe('Pegar o gel')
    expect(taskTitleFrom('adiciona colocar marmita na bolsa no checklist terça às 7h30')).toBe('Colocar marmita na bolsa')
  })

  it('"monta meu checklist de amanhã" lists meals with times', () => {
    const p = adjust('monta meu checklist de amanhã')
    expect(p.checklist?.filter((l) => l.kind === 'meal').map((l) => l.time)).toEqual(['05:00', '06:40', '07:20', '08:00', '12:00', '16:00', '20:00'])
  })
})

describe('routing', () => {
  it('questions the Chief answers are not changes', () => {
    for (const q of EXAMPLE_QUESTIONS) expect(understand(getDB(), q, TODAY, 8 * 60).kind, q).toBe('answer')
  })

  it('pure training sentences keep the training planner behaviour', () => {
    const p = planDay(getDB(), 'amanhã troco o pedal longo por surf', TODAY)
    expect(p?.summary).toBe('Amanhã: 🚴‍♀️ Pedal longo → 🏄‍♀️ Surf')
  })

  it('meal prep triggers', () => {
    // "lista de supermercado / feira" is the shopping reply now (pantry, prepared food, trip days) — see lumos-act.test.ts.
    expect(understand(getDB(), 'faz lista de supermercado', TODAY, 600).kind).toBe('reply')
    for (const q of ['faz minhas marmitas', 'organiza minha alimentação da semana', 'quero deixar tudo pronto', 'o que preparo domingo?', 'não quero cozinhar durante a semana'])
      expect(understand(getDB(), q, TODAY, 600), q).toMatchObject({ kind: 'mealprep', intent: { kind: 'week' } })
    expect(understand(getDB(), 'O que faço com essa porção?', TODAY, 600)).toMatchObject({ kind: 'mealprep', intent: { kind: 'recipe', portions: 1 } })
    expect(understand(getDB(), 'receita do almoço em 4 porções', TODAY, 600)).toMatchObject({ kind: 'mealprep', intent: { kind: 'recipe', meal: 'almoco', portions: 4 } })
  })

  it('"Amanhã vou presencial o dia inteiro." on a presencial day → the engine kit, nothing to change', () => {
    const t = understand(getDB(), 'Amanhã vou presencial o dia inteiro.', MONDAY, 600)
    expect(t.kind).toBe('reply')
    const r = (t as Extract<typeof t, { kind: 'reply' }>).reply
    expect(r.action).toBeUndefined()
    expect(r.sections?.[0].title).toBe('KIT TERÇA — PRESENCIAL')
    expect(r.sub).toMatch(/esquema pegou e saiu/)
    expect(r.link?.to).toBe('/meal-prep')
  })

  it('…and on a remote day: the day really becomes presencial (per-day override) + the kit', () => {
    const t = understand(getDB(), 'Amanhã vou presencial o dia inteiro.', '2026-10-07', 600)
    const r = (t as Extract<typeof t, { kind: 'reply' }>).reply
    expect(r.action?.mode).toBe('direct')
    expect(r.sections?.[0].title).toMatch(/KIT QUINTA — PRESENCIAL/)
  })
})
