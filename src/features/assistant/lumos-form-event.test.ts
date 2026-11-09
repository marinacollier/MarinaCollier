import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { actions, applyModuleSeeds, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { apply1106 } from '@/data/calendar/fixture-1106'
import { ask, useConversation } from './conversation'
const MSG = `Lumos, adiciona ao Marina OS, na minha agenda e no roteiro de Cape Town:
Evento: Missa na St George’s Cathedral
Data: Quarta-feira, 11/11/2026
Horário: 13h15 (horário de Cape Town)
Local: St George’s Cathedral, 5 Wale Street, Cape Town
Categoria: Espiritualidade / Viagem / Experiências culturais
Status: Planejado — horário a confirmar
Descrição: Participar da celebração anglicana.
Ações:
* Adicionar ao calendário e ao roteiro da África do Sul.
* Criar lembrete para 12h30.
* Não marcar como realizado até minha confirmação.`
it('a message written as a form becomes ONE event: name, day, time, place; "Quarta-feira" is not the market', async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(apply1106(applyModuleSeeds(buildSeed('2026-11-09'))))
  const n0 = getDB().tripItems.length + getDB().events.length + getDB().tasks.length
  const id = ask(MSG, { date: '2026-11-09', minutes: 15 * 60, iso: '2026-11-09T13:13:00Z' })!
  const e = useConversation.getState().exchanges.find((x) => x.id === id)!
  expect(e.lumos?.reply.area).toBe('agenda')
  expect(getDB().tripItems.length + getDB().events.length + getDB().tasks.length - n0).toBe(1)
  const ev = getDB().events.find((x) => x.title === 'Missa na St George’s Cathedral')!
  expect(ev).toMatchObject({ date: '2026-11-11', startTime: '13:15', location: 'St George’s Cathedral, 5 Wale Street, Cape Town', planType: 'a_confirmar' })
  expect(ev.tripId).toBeTruthy()
  // Asking again does not duplicate it.
  ask(MSG, { date: '2026-11-09', minutes: 15 * 60 + 1, iso: '2026-11-09T13:14:00Z' })
  expect(getDB().events.filter((x) => x.title === 'Missa na St George’s Cathedral')).toHaveLength(1)
})
