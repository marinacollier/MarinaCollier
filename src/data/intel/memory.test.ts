import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { buildSeed } from '../seed'
import { confirmPattern, correctMemory, forget, memoryByKey, memoryView, observe, rememberFact, updateState } from './memory'
import { lifeHistory } from './log'
import { planChange } from './graph'
import type { Now } from './types'

const FRIDAY = '2026-10-02'
const now: Now = { date: FRIDAY, minutes: 600 }

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(FRIDAY))
})

describe('TemporalMemory', () => {
  it('layers by kind; seed facts are facts, seed preferences/state come from her (user)', () => {
    const view = memoryView(getDB(), now)
    const seedFact = view.find((v) => v.item?.source === 'seed' && v.item.kind === 'fact')
    const seedPref = view.find((v) => v.item?.source === 'seed' && v.item.kind === 'preference')
    if (seedFact) expect(seedFact).toMatchObject({ layer: 'fact', provenance: 'fact', confidence: 'high' })
    if (seedPref) expect(seedPref).toMatchObject({ layer: 'preference', provenance: 'user', confidence: 'high' })
    const order = ['fact', 'preference', 'state', 'exception', 'history', 'pattern']
    const idx = view.map((v) => order.indexOf(v.layer))
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  })

  it('one-occurrence exceptions come from ScheduleOverrides (never as rules)', () => {
    planChange(getDB(), { kind: 'workMode', date: '2026-10-05', mode: 'presencial' }, now).apply()
    const ex = memoryView(getDB(), now).filter((v) => v.layer === 'exception')
    expect(ex).toContainEqual(expect.objectContaining({ text: 'segunda: trabalho presencial', validUntil: '2026-10-05' }))
  })

  it('rememberFact upserts by key and logs; undo removes both', () => {
    const { item, undo } = rememberFact('Não faz mais yoga na terça.', { area: 'esportes', key: 'yoga.weekday', kind: 'preference' })
    expect(getDB().memory.filter((m) => m.key === 'yoga.weekday')).toHaveLength(1)
    expect(memoryByKey(getDB(), 'yoga.weekday')?.text).toBe('Não faz mais yoga na terça.')
    expect(getDB().lifeLog.some((e) => e.ref?.id === item.id && e.kind === 'learned')).toBe(true)
    undo()
    expect(getDB().lifeLog).toEqual([])
  })

  it('updateState ends a state into history ("terminei o livro") and it is searchable later', () => {
    updateState('book.current', null, { area: 'leitura', history: 'Terminou Continuous Discovery Habits em 02/10.' })
    expect(memoryByKey(getDB(), 'book.current')?.status ?? 'archived').toBe('archived')
    expect(getDB().memory.some((m) => m.kind === 'history' && m.text.startsWith('Terminou'))).toBe(true)
    expect(lifeHistory(getDB(), { text: 'terminou continuous' })).toHaveLength(1)
    expect(memoryView(getDB(), now).some((v) => v.layer === 'history')).toBe(true)
  })

  it('observe never becomes a rule by itself; asks after 3; Marina decides', () => {
    let r = observe('training.time.0600', 'Você costuma preferir esse treino às 06:00', 'esportes')
    expect(r.readyToAsk).toBe(false)
    observe('training.time.0600', 'Você costuma preferir esse treino às 06:00', 'esportes')
    r = observe('training.time.0600', 'Você costuma preferir esse treino às 06:00', 'esportes')
    expect(r.item).toMatchObject({ status: 'observed', evidence: 3 })
    expect(r.readyToAsk).toBe(true)
    expect(memoryView(getDB(), now).find((v) => v.item?.id === r.item!.id)).toMatchObject({ layer: 'pattern', provenance: 'inference', confidence: 'medium' })
    confirmPattern(r.item!.id, true)
    expect(getDB().memory.find((m) => m.id === r.item!.id)).toMatchObject({ status: 'confirmed', source: 'marina' })
    // Already a rule: further observations change nothing.
    expect(observe('training.time.0600', 'x', 'esportes').readyToAsk).toBe(false)
  })

  it('a rejected pattern is not re-learned; correct + forget are undoable', () => {
    const r = observe('k', 'Você costuma pular o lanche', 'alimentacao')
    confirmPattern(r.item!.id, false)
    expect(observe('k', 'Você costuma pular o lanche', 'alimentacao').item?.status).toBe('archived')
    const fact = rememberFact('Mora em São Paulo', { area: 'casa', key: 'home.city.test' }).item
    const undoC = correctMemory(fact.id, 'Mora em São Paulo, zona sul')
    expect(getDB().memory.find((m) => m.id === fact.id)?.text).toBe('Mora em São Paulo, zona sul')
    undoC()
    const undoF = forget(fact.id)
    expect(getDB().memory.some((m) => m.id === fact.id)).toBe(false)
    undoF()
    expect(getDB().memory.find((m) => m.id === fact.id)?.text).toBe('Mora em São Paulo')
  })
})
