import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { emptyDB } from '@/data/defaults'
import { routineItemsFor } from '@/data/selectors'
import { SEED_IDS } from '@/data/seed/ids'
import { essentialSuggestion, isItemDone, morningRoutine, routineView, setItemNote, setRoutineMode, stepsDoneOf, toggleItem, toggleStep } from './routine'
import { addPriority, FULL_COPY, prioritiesOf } from './priorities'

const TODAY = '2026-10-02' // sexta (remoto)
const TUESDAY = '2026-10-06' // presencial

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(TODAY))
})

const item = (title: string) => routineItemsFor(getDB(), SEED_IDS.routineMorning, TODAY).find((i) => i.title.startsWith(title))!
const view = () => routineView(getDB(), morningRoutine(getDB())!, TODAY)

describe('Milagre da Manhã', () => {
  it('optional items never count as missing', () => {
    const v = view()
    expect(v.items).toHaveLength(11)
    expect(v.total).toBe(10)
    toggleItem(item('Passeio'), TODAY)
    expect(view()).toMatchObject({ done: 1, total: 11 })
  })

  it('sub-steps auto-check the item; tapping the item checks it directly', () => {
    const higiene = item('Higiene')
    for (let i = 0; i < 4; i++) toggleStep(higiene, i, TODAY)
    expect(isItemDone(getDB(), higiene, TODAY)).toBe(false)
    expect(view().done).toBe(0) // partial steps don't count
    toggleStep(higiene, 4, TODAY)
    expect(isItemDone(getDB(), higiene, TODAY)).toBe(true)
    toggleStep(higiene, 2, TODAY) // un-tick a step → reopens
    expect(isItemDone(getDB(), higiene, TODAY)).toBe(false)
    expect(stepsDoneOf(getDB(), higiene, TODAY)).toEqual([0, 1, 3, 4])

    const despertar = item('Despertar')
    expect(toggleItem(despertar, TODAY)).toBe(true)
    expect(stepsDoneOf(getDB(), despertar, TODAY)).toHaveLength(5)
    expect(toggleItem(despertar, TODAY)).toBe(false)
    expect(getDB().occurrences.some((o) => o.parentId === despertar.id)).toBe(false)
  })

  it('journaling text is kept for the day without checking the item', () => {
    const j = item('Journaling')
    setItemNote(j, TODAY, 'grata pelo mar ')
    const occ = getDB().occurrences.find((o) => o.parentId === j.id)!
    expect(occ.note).toBe('grata pelo mar')
    expect(isItemDone(getDB(), j, TODAY)).toBe(false)
    toggleItem(j, TODAY)
    toggleItem(j, TODAY)
    expect(getDB().occurrences.find((o) => o.parentId === j.id)?.note).toBe('grata pelo mar')
  })

  it('"Hoje vou de versão curta" shows only Essential items, and switching back keeps progress', () => {
    toggleItem(item('Higiene'), TODAY)
    toggleItem(item('Meditação'), TODAY)
    setRoutineMode(SEED_IDS.routineMorning, TODAY, 'essential')
    expect(view()).toMatchObject({ mode: 'essential', done: 1, total: 5 })
    setRoutineMode(SEED_IDS.routineMorning, TODAY, 'completa')
    expect(view()).toMatchObject({ mode: 'completa', done: 2 })
  })

  it('suggests the short version for early training or presencial days — gently, once', () => {
    const r = morningRoutine(getDB())!
    // The real seed plans Friday's 06:00 long run, which already triggers the suggestion.
    expect(essentialSuggestion(getDB(), r, TODAY)).toBe('Treino às 06h — que tal a versão curta hoje?')
    for (const w of getDB().workouts.filter((x) => x.date === TODAY)) actions.remove('workouts', w.id)
    expect(essentialSuggestion(getDB(), r, TODAY)).toBeUndefined()
    actions.create('workouts', { date: TODAY, time: '07:00', modality: 'natacao', status: 'planejado', order: 0 })
    expect(essentialSuggestion(getDB(), r, TODAY)).toBe('Treino às 07h — que tal a versão curta hoje?')
    setRoutineMode(r.id, TODAY, 'completa')
    expect(essentialSuggestion(getDB(), r, TODAY)).toBeUndefined()
    expect(essentialSuggestion(getDB(), r, TUESDAY)).toBe('Dia presencial — que tal a versão curta hoje?')
    actions.create('workouts', { date: TUESDAY, time: '08:00', modality: 'corrida', status: 'planejado', order: 0 })
    expect(essentialSuggestion(getDB(), r, TUESDAY)).toBe('Dia presencial — que tal a versão curta hoje?')
  })
})

describe('Top 3 por domínio', () => {
  beforeEach(() => actions.replaceDB(emptyDB()))

  it('keeps up to 3 per domain, separate from the main Top 3', () => {
    for (const t of ['A', 'B', 'C']) expect(addPriority(TODAY, t).ok).toBe(true)
    for (const t of ['W1', 'W2', 'W3']) expect(addPriority(TODAY, t, undefined, 'trabalho').ok).toBe(true)
    expect(addPriority(TODAY, 'W4', undefined, 'trabalho')).toEqual({ ok: false, reason: 'full' })
    expect(addPriority(TODAY, 'Nadar', undefined, 'corpo').ok).toBe(true)
    expect(prioritiesOf(getDB(), TODAY).map((p) => p.title)).toEqual(['A', 'B', 'C'])
    expect(prioritiesOf(getDB(), TODAY, 'trabalho')).toHaveLength(3)
    expect(prioritiesOf(getDB(), TODAY, 'corpo')[0].domain).toBe('corpo')
    expect(FULL_COPY).toBe('Tem coisa demais aqui. Escolhe três.')
  })
})
