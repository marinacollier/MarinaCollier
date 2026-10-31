/**
 * Lugares que conheci through Lumos: her sentences, through the real conversation store.
 * Answers come from derived data; writes are direct + Desfazer; ambiguity (city vs state) becomes a question.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { applyPlacesSeed, placeSeedId } from '@/data/seed/places'
import { getDB, useStore } from '@/data/store'
import { placeCounts, wishes } from '@/data/places/model'
import type { Trip } from '@/data/types'
import type { LumosReply } from './act/types'
import { ask, canUndo, clearConversation, undoReply, useConversation, type Exchange } from './conversation'

const TODAY = '2026-10-31'
const NOW: Now = { date: TODAY, minutes: 15 * 60, iso: `${TODAY}T15:00:00.000-03:00` }

function talk(text: string): Exchange {
  const id = ask(text, NOW)!
  return useConversation.getState().exchanges.find((e) => e.id === id)!
}
const reply = (e: Exchange): LumosReply => {
  expect(e.lumos, e.question).toBeDefined()
  return e.lumos!.reply
}

const dream = (name: string, flag = '✈️'): Trip => ({
  id: `trip-${name}`,
  createdAt: TODAY,
  updatedAt: TODAY,
  name,
  place: name,
  flag,
  datesConfirmed: false,
  interests: [],
  tone: 'sand',
  links: [],
  status: 'sonhando',
  order: 10,
})

beforeEach(() => {
  useStore.setState({ db: applyPlacesSeed(buildSeed(TODAY)), hydrated: true })
  clearConversation()
})

describe('perguntas', () => {
  it('"já fui pro Maranhão?" → sim, pelos Lençóis', () => {
    const r = reply(talk('Já fui pro Maranhão?'))
    expect(r.text).toMatch(/Sim/)
    expect(r.text).toMatch(/Lençóis Maranhenses/)
    expect(r.action).toBeUndefined()
  })

  it('"já fui pra Salvador?" → sim; "já fui pra São Paulo?" → mora lá', () => {
    expect(reply(talk('já fui pra Salvador?')).text).toMatch(/Sim! Salvador/)
    expect(reply(talk('já fui pra São Paulo?')).text).toMatch(/mora em São Paulo/)
  })

  it('"já fui pro Amazonas?" → ainda não, offers to register (writes nothing)', () => {
    const before = getDB().places
    const r = reply(talk('já fui pro Amazonas?'))
    expect(r.text).toMatch(/Ainda não/)
    expect(r.options?.[0].ask).toMatch(/registra que fui pra Amazonas/)
    expect(getDB().places).toBe(before)
  })

  it('"quantos estados conheço?" → 11 de 27 (com o DF)', () => {
    const r = reply(talk('quantos estados eu conheço?'))
    expect(r.text).toMatch(/11 de 27/)
    const ufs = r.lines!.map((l) => l.text)
    expect(ufs).toContain('Maranhão · MA')
    expect(ufs).toContain('Distrito Federal · DF')
    expect(r.lines!.find((l) => l.text === 'Goiás · GO')!.sub).toMatch(/Chapada dos Veadeiros/)
  })

  it('"quantos países já visitei?" → 3', () => {
    const r = reply(talk('quantos países já visitei?'))
    expect(r.text).toMatch(/^3 países/)
    expect(r.text).toMatch(/Panamá/)
  })

  it('"já fui pro Japão?" with a dream trip → sonho de viagem, nothing written', () => {
    const db = getDB()
    useStore.setState({ db: { ...db, trips: [...db.trips, dream('Japão', '🇯🇵')] } })
    const r = reply(talk('já fui pro Japão?'))
    expect(r.text).toMatch(/sonhos de viagem/)
    expect(r.action).toBeUndefined()
  })
})

describe('registra que fui', () => {
  it('a city with its state → created, counts the new state, Desfazer removes it', () => {
    const before = placeCounts(getDB().places)
    const e = talk('registra que fui pra Ouro Preto, MG em 2019')
    const r = reply(e)
    expect(r.text).toMatch(/Registrei Ouro Preto/)
    const p = getDB().places.find((x) => x.name === 'Ouro Preto')!
    expect(p).toMatchObject({ kind: 'cidade', country: 'BR', uf: 'MG', status: 'visitei', source: 'lumos', firstVisit: '2019', parentId: placeSeedId('estado-mg') })
    expect(placeCounts(getDB().places).brStates).toBe(before.brStates) // MG was already known
    expect(e.lumos!.status).toBe('done')
    expect(canUndo(e.id)).toBe(true)
    undoReply(e.id)
    expect(getDB().places.some((x) => x.name === 'Ouro Preto')).toBe(false)
    expect(getDB().lifeLog.some((ev) => ev.ref?.type === 'place')).toBe(false)
  })

  it('a new country → país; the count goes to 4', () => {
    const r = reply(talk('anota que eu fui pra Argentina'))
    expect(r.sub).toMatch(/4 países/)
    expect(getDB().places.find((x) => x.country === 'AR')).toMatchObject({ kind: 'pais', name: 'Argentina', status: 'visitei' })
  })

  it('a new state through its capital: Recife already PE; Manaus → AM becomes the 12th', () => {
    const r = reply(talk('registra que fui pra Manaus'))
    expect(r.sub).toMatch(/12 de 27/)
    expect(getDB().places.find((x) => x.name === 'Manaus')).toMatchObject({ kind: 'cidade', uf: 'AM' })
  })

  it('"Rio" is city or state → asks, writes nothing; the city answer creates the city', () => {
    const before = getDB().places
    const r = reply(talk('registra que fui pro Rio'))
    expect(r.text).toMatch(/Rio de Janeiro já está/)
    expect(getDB().places).toBe(before)
    const amb = reply(talk('registra que fui pra Belo Horizonte'))
    expect(amb.action).toBeDefined()
    // Rio de Janeiro as a state is known: still, asking for the city creates the city.
    const c = reply(talk('registra que fui pra cidade do Rio de Janeiro'))
    expect(c.text).toMatch(/Registrei Rio de Janeiro/)
    expect(getDB().places.filter((x) => x.name === 'Rio de Janeiro').map((x) => x.kind).sort()).toEqual(['cidade', 'estado'])
  })

  it('a name that is both city and state, not recorded yet → asks which one, writes nothing', () => {
    useStore.setState({ db: buildSeed(TODAY) })
    const r = reply(talk('registra que fui pra São Paulo'))
    expect(r.text).toMatch(/a cidade ou o estado/)
    expect(r.options!.map((o) => o.label)).toEqual(['A cidade', 'O estado'])
    expect(r.action).toBeUndefined()
  })

  it('an unknown name → asks where it is; never guesses', () => {
    const before = getDB().places
    const r = reply(talk('registra que fui pra Bonito'))
    expect(r.text).toMatch(/Onde fica Bonito/)
    expect(getDB().places).toBe(before)
  })

  it('already there → says so, nothing written; "quero conhecer" → becomes visitei', () => {
    const before = getDB().places
    expect(reply(talk('registra que fui pra Petrolina')).text).toMatch(/Petrolina já está/)
    expect(getDB().places).toBe(before)
    const db = getDB()
    useStore.setState({ db: { ...db, places: [...db.places, { ...db.places[0], id: 'w1', name: 'Jericoacoara', kind: 'cidade', country: 'BR', uf: 'CE', status: 'quero_ir', parentId: undefined, tripIds: undefined }] } })
    const e = talk('registra que fui pra Jericoacoara')
    expect(reply(e).text).toMatch(/saiu do Quero conhecer/)
    expect(getDB().places.find((x) => x.id === 'w1')!.status).toBe('visitei')
    undoReply(e.id)
    expect(getDB().places.find((x) => x.id === 'w1')!.status).toBe('quero_ir')
  })

  it('everyday sentences are not places', () => {
    const before = getDB().places
    for (const s of ['anota que conheci a Ana no trabalho', 'já fui pra academia hoje']) {
      const e = talk(s)
      expect(e.lumos?.reply.area, s).not.toBe('lugares')
    }
    expect(getDB().places).toBe(before)
  })
})

describe('Quero conhecer: dream trips derived, never duplicated', () => {
  it('dream trips show once, without records; a matching quero_ir place absorbs the trip; known places drop out', () => {
    const db = getDB()
    const trips = [...db.trips.filter((t) => t.id !== 'trip-itacare'), ...['Tailândia', 'Japão', 'Peru', 'Patagônia Chilena', 'Austrália', 'Amsterdã', 'Costa Rica'].map((n) => dream(n)), dream('Panamá')]
    const places = [...db.places, { ...db.places[0], id: 'w-peru', name: 'Peru', kind: 'pais' as const, country: 'PE', status: 'quero_ir' as const, parentId: undefined, tripIds: undefined }]
    const w = wishes({ trips, places }, TODAY)
    const names = w.map((x) => x.name)
    expect(names.filter((x) => x === 'Peru')).toHaveLength(1)
    expect(w.find((x) => x.name === 'Peru')!.place?.id).toBe('w-peru')
    expect(w.find((x) => x.name === 'Peru')!.trip?.id).toBe('trip-Peru')
    expect(names).toEqual(expect.arrayContaining(['Tailândia', 'Japão', 'Patagônia Chilena', 'Austrália', 'Amsterdã', 'Costa Rica']))
    expect(names).not.toContain('Panamá') // she has been there
    expect(names).not.toContain('Cape Town') // South Africa is happening now
    expect(w.find((x) => x.name === 'Japão')).toMatchObject({ kind: 'pais', country: 'JP' })
    // Nothing is counted or stored.
    expect(placeCounts(places)).toEqual(placeCounts(db.places.concat()))
  })
})
