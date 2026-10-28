/**
 * The Expedição by conversation — her own message of 28/10 in Cape Town, through the real conversation store:
 * what changes on the trip, the training, the school counter, the money in ZAR, and that Desfazer puts it back.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { applyExpeditionSeed } from '@/data/seed/expedition'
import { getDB, useStore } from '@/data/store'
import { schoolDays, schoolSummary } from '@/features/travel/expedition/logic'
import { readSpends } from './act/handlers/trip'
import { ask, clearConversation, undoReply, useConversation } from './conversation'

const DAY = '2026-10-28'
const NOW: Now = { date: DAY, minutes: 13 * 60, iso: `${DAY}T13:00:00.000-03:00` }
const MSG = `hj faltei aula, e fiz de manhã o surf no muz (não sei escrever kkkkk) foi incrível eu amei!
gastei 1500 zar e 250 zar de alimentação e 300 zar de uber ida e volta

a tarde irei na lions.`

const trip = () => getDB().trips.find((t) => t.expedition)!
const items = () => getDB().tripItems.filter((i) => i.tripId === trip().id)
const byTitle = (re: RegExp) => items().find((i) => re.test(i.title))!

beforeEach(() => {
  useStore.setState({ db: applyExpeditionSeed(buildSeed(DAY)), hydrated: true })
  clearConversation()
})

describe('her message of 28/10', () => {
  it('reads every amount with what it was for', () => {
    expect(readSpends('gastei 1500 zar e 250 zar de alimentacao e 300 zar de uber ida e volta')).toEqual([
      { cents: 150000, purpose: 'atividade', what: '' },
      { cents: 25000, purpose: 'comida', what: 'alimentacao' },
      { cents: 30000, purpose: 'uber', what: 'uber ida e volta' },
    ])
  })

  it('updates the trip, the training and the school counter in one go', async () => {
    const surfBefore = byTitle(/surf/i)
    expect(surfBefore.date).not.toBe(DAY)
    const id = ask(MSG.replace('hj', 'hoje'), NOW)!
    expect(useConversation.getState().exchanges.every((e) => e.lumos?.reply.area === 'viagem')).toBe(true)
    expect(id).toBeDefined()
    await new Promise((r) => setTimeout(r, 0))

    const surf = items().find((i) => i.id === surfBefore.id)!
    expect(surf.status).toBe('feito')
    expect(surf.date).toBe(DAY)
    expect(surf.paidCents).toBe(150000)
    expect(surf.uberCents).toBe(30000)
    expect(surf.notes).toMatch(/Amei/)
    expect(byTitle(/Alimenta/).paidCents).toBe(25000)
    expect(getDB().workouts.some((w) => w.date === DAY && w.modality === 'surf' && w.status === 'feito')).toBe(true)
    const lions = byTitle(/Lion/)
    expect(lions.status).toBe('confirmado')
    expect(lions.date).toBe(DAY)
    const day = schoolDays(trip(), items()).find((d) => d.date === DAY)!
    expect(day.impact).toBe('dia')
    expect(schoolSummary(schoolDays(trip(), items())).lost).toBeGreaterThanOrEqual(1)

    // A long message is answered in parts (each with its own Desfazer): undo them all, newest first.
    for (const e of [...useConversation.getState().exchanges].reverse()) undoReply(e.id)
    expect(items().find((i) => i.id === surfBefore.id)!.status).toBe(surfBefore.status)
    expect(items().some((i) => /Alimenta|Falta/.test(i.title) && i.date === DAY)).toBe(false)
  })

  it('also with the plain "hj" spelling', () => {
    const id = ask(MSG, NOW)!
    expect(useConversation.getState().exchanges.find((e) => e.id === id)!.lumos?.reply.area).toBe('viagem')
  })

  it('stays out of the way outside the trip', () => {
    const id = ask('gastei 1500 zar no surf', { date: '2026-12-01', minutes: 600, iso: '2026-12-01T10:00:00.000-03:00' })!
    expect(useConversation.getState().exchanges.find((e) => e.id === id)!.lumos?.reply.area).not.toBe('viagem')
  })
})
