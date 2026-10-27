/**
 * Expedição África do Sul — the base itinerary she gave on 27/10 (docs/specs/EXPEDICAO_AFRICA_DO_SUL.md),
 * layered on the existing trip `trip-africa-do-sul` instead of a parallel module.
 *
 * `applyExpeditionSeed` runs at every boot and is additive and idempotent:
 * - nothing happens when the trip is gone (she deleted it);
 * - trip settings (`expedition`) are added only when missing; the start date moves 22/10 → 24/10 only
 *   when the trip was never edited;
 * - older seed items that clearly match (escola, hospedagem, safári, voos) are upgraded only while
 *   untouched (createdAt === updatedAt and the original title). Their titles stay as they were when still
 *   right (imports and Lumos find them by title). An edited one keeps everything she wrote and only gains
 *   expedition fields it doesn't have (address, pickup, checklist…);
 * - new items use stable ids, are added once, never after she deleted them (`profile.removedSeedIds`)
 *   and never next to an item of hers with the same title.
 *
 * Honest statuses: flights, residence and school are confirmed as she gave them; anything "sujeito a
 * vento / disponibilidade / liberação médica" stays pending or weather-dependent. No price, weather,
 * availability, route or Uber value is invented — the only value is the R4000 budget she wrote.
 */
import type { DB, NewItem, Trip, TripExpedition, TripItem } from '../types'
import { seedId } from './context'
import { SEED_IDS } from './ids'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'

export const EXPEDITION_TRIP_ID = SEED_IDS.tripAfrica
export const zaId = (slug: string) => seedId('travel', `za-${slug}`)
const oldId = (slug: string) => seedId('travel', `${SEED_IDS.tripAfrica}-${slug}`)

const RESIDENCE = { name: 'Student at Home Single Apartment Residence', address: '106 Adderley Street, Cape Town 8001' }
const SCHOOL_ADDRESS = '40 Shortmarket Street, Cape Town'

export function expeditionSettings(): TripExpedition {
  return {
    timeZone: 'Africa/Johannesburg',
    currency: 'ZAR',
    marginPct: 15,
    residence: { ...RESIDENCE },
    school: {
      name: 'Bayswater Cape Town',
      address: SCHOOL_ADDRESS,
      from: '2026-10-26',
      until: '2026-11-13',
      days: [
        { weekday: 1, start: '09:00', end: '15:10' },
        { weekday: 2, start: '09:00', end: '15:10' },
        { weekday: 3, start: '09:00', end: '15:10' },
        { weekday: 4, start: '09:00', end: '15:10' },
        { weekday: 5, start: '09:00', end: '12:20' },
      ],
    },
    // Public South African numbers (not personal contacts). Hers go next to them.
    emergencyContacts: [
      { name: 'Emergência pelo celular', role: 'número público', contact: '112' },
      { name: 'Polícia (SAPS)', role: 'número público', contact: '10111' },
      { name: 'Ambulância', role: 'número público', contact: '10177' },
    ],
    weather: { lat: -33.9249, lon: 18.4241, label: 'Cape Town' },
    safetyNotes:
      'Trilhas e deslocamentos a pé de preferência com luz do dia e acompanhada quando indicado. Clima adverso (vento, mar, chuva) cancela atividade — sem insistir.',
  }
}

type Payload = Omit<NewItem<'tripItems'>, 'tripId' | 'order'>

interface Upgrade {
  id: string
  /** The original seed title: the record is only upgraded while it still has it and was never edited. */
  oldTitle: string
  next: Payload
  /** Expedition-only fields an edited record may still receive (only where it has none). */
  enrich: Partial<TripItem>
}

const CT = 'Cape Town'
const GR = 'Garden Route'

/** Existing seed items that are the same thing as an item of the spec. */
const UPGRADES: Upgrade[] = [
  {
    id: oldId('hosp-cape-town'),
    oldTitle: 'Hospedagem Cape Town',
    next: {
      section: 'hospedagem',
      group: 'Accommodation',
      title: 'Hospedagem Cape Town',
      status: 'confirmado',
      certainty: 'confirmado',
      booking: 'confirmado',
      date: '2026-10-24',
      endDate: '2026-11-13',
      supplier: RESIDENCE.name,
      address: RESIDENCE.address,
      notes: 'Student at Home — single apartment. Check-out em 13/11.',
    },
    enrich: { address: RESIDENCE.address, supplier: RESIDENCE.name },
  },
  {
    id: oldId('escola'),
    oldTitle: 'Escola / intercâmbio',
    next: {
      section: 'reserva',
      group: 'School',
      title: 'Escola / intercâmbio',
      status: 'confirmado',
      certainty: 'confirmado',
      booking: 'confirmado',
      supplier: 'Bayswater Cape Town',
      address: SCHOOL_ADDRESS,
      notes: 'Bayswater Cape Town. Aulas seg–qui 09:00–15:10 e sex 09:00–12:20, até 13/11.',
    },
    enrich: { address: SCHOOL_ADDRESS, supplier: 'Bayswater Cape Town' },
  },
  {
    id: oldId('ida-johannesburg'),
    oldTitle: 'Ida para a região de Johannesburg',
    next: {
      section: 'voo',
      group: 'Flights',
      title: 'Voo SA366 · Cape Town → Johannesburg',
      status: 'confirmado',
      certainty: 'confirmado',
      date: '2026-11-13',
      time: '19:35',
      endTime: '21:35',
      paymentStatus: 'a_confirmar',
      checklistKind: 'voo',
      notes: 'CPT 19:35 → JNB 21:35. Antes: escola até 12:20 e check-out.',
    },
    enrich: { checklistKind: 'voo' },
  },
  {
    id: oldId('voo-retorno'),
    oldTitle: 'Retorno internacional — voo 10:00, OR Tambo',
    next: {
      section: 'voo',
      group: 'Flights',
      title: 'Voo internacional · Johannesburg → São Paulo (GRU)',
      status: 'confirmado',
      certainty: 'confirmado',
      date: '2026-11-16',
      time: '11:10',
      paymentStatus: 'a_confirmar',
      checklistKind: 'voo',
      notes: 'JNB 11:10 → GRU 16:15 (horário de Brasília). Chegar ao aeroporto até ~08:00.',
    },
    enrich: { checklistKind: 'voo' },
  },
  {
    id: oldId('hosp-johannesburg'),
    oldTitle: 'Hospedagem Johannesburg',
    next: {
      section: 'hospedagem',
      group: 'Accommodation',
      title: 'Hospedagem Johannesburg',
      status: 'a_confirmar',
      certainty: 'pendente',
      date: '2026-11-13',
      endDate: '2026-11-14',
      notes: 'Hotel perto do aeroporto, noite de 13/11 (depois do SA366).',
    },
    enrich: {},
  },
  {
    id: oldId('safari-dias'),
    oldTitle: 'Safari',
    next: {
      section: 'roteiro',
      group: 'Safari',
      title: 'Safari',
      supplier: 'Pilanesberg · Tlou Tented',
      status: 'a_confirmar',
      certainty: 'pendente',
      booking: 'aguardando',
      date: '2026-11-14',
      endDate: '2026-11-15',
      time: '05:30',
      endTime: '18:00',
      paymentStatus: 'a_confirmar',
      checklistKind: 'safari',
      needsPickup: true,
      pickupConfirmed: false,
      pickup: 'Estimado entre 05:30 e 06:30 — ponto a confirmar',
      notes: 'Pilanesberg, Tlou Tented. Transfers e game drives. Retorno estimado 15/11 entre 17:30 e 18:00. Reserva individual e ponto de pickup pendentes de confirmação.',
    },
    enrich: { checklistKind: 'safari', needsPickup: true, pickup: 'Estimado entre 05:30 e 06:30 — ponto a confirmar' },
  },
  {
    id: oldId('surf'),
    oldTitle: 'Surf',
    next: {
      section: 'esporte',
      group: CT,
      title: 'Surf em Muizenberg',
      status: 'a_fazer',
      certainty: 'estimado',
      date: '2026-11-01',
      time: '09:00',
      checklistKind: 'surf',
      flexible: true,
    },
    enrich: { checklistKind: 'surf' },
  },
  {
    id: oldId('corrida'),
    oldTitle: 'Corrida',
    next: {
      section: 'esporte',
      group: CT,
      title: 'Corrida Sea Point (5–6 km)',
      status: 'a_fazer',
      certainty: 'estimado',
      date: '2026-10-29',
      time: '06:35',
      checklistKind: 'corrida',
      flexible: true,
    },
    enrich: { checklistKind: 'corrida' },
  },
  {
    id: oldId('natacao'),
    oldTitle: 'Natação',
    next: {
      section: 'esporte',
      group: CT,
      title: 'Piscina de água salgada',
      status: 'a_fazer',
      certainty: 'estimado',
      date: '2026-10-29',
      time: '16:00',
      checklistKind: 'natacao',
      flexible: true,
    },
    enrich: { checklistKind: 'natacao' },
  },
]

const p = (slug: string, x: Payload) => ({ slug, ...x })

/** The rest of the base itinerary 24/10–16/11 and the extras. */
const NEW_ITEMS: (Payload & { slug: string })[] = [
  p('lions-head', {
    section: 'esporte', group: CT, title: "Lion's Head", status: 'a_fazer', certainty: 'estimado', date: '2026-10-28', time: '16:25',
    checklistKind: 'trilha', flexible: true, notes: 'Início da trilha por volta de 16:25. Descer em grupo, com iluminação.',
    risk: 'Descida no fim da tarde.',
  }),
  p('table-mountain', { section: 'roteiro', group: CT, title: 'Table Mountain', status: 'a_fazer', certainty: 'estimado', date: '2026-10-30', time: '13:30', flexible: true, notes: 'Depois da escola (sexta, até 12:20).' }),
  p('camps-bay', { section: 'quero_ir', group: CT, title: 'Camps Bay', status: 'a_fazer', certainty: 'estimado', date: '2026-10-30', time: '16:30', flexible: true }),
  p('cape-point', {
    section: 'reserva', group: CT, title: "Excursão Cape Point · Cabo da Boa Esperança · Chapman's Peak · Boulders Beach",
    status: 'a_confirmar', certainty: 'pendente', date: '2026-10-31', time: '07:30', endTime: '18:30',
  }),
  p('kalk-bay', { section: 'quero_ir', group: CT, title: 'Kalk Bay', status: 'a_fazer', certainty: 'estimado', date: '2026-11-01', time: '12:00', flexible: true }),
  p('kirstenbosch', { section: 'quero_ir', group: CT, title: 'Kirstenbosch', status: 'a_fazer', certainty: 'estimado', date: '2026-11-01', time: '14:15', flexible: true }),
  p('bo-kaap', { section: 'quero_ir', group: CT, title: "Bo-Kaap e Company's Garden", status: 'a_fazer', certainty: 'estimado', date: '2026-11-02', flexible: true, notes: 'Depois da escola.' }),
  p('caiaque', { section: 'reserva', group: CT, title: 'Caiaque', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-03', time: '15:45', flexible: true, notes: 'Por volta de 15:45, sujeito a disponibilidade.' }),
  p('bike-urbana', { section: 'reserva', group: CT, title: 'Bike urbana', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-03', time: '17:00', checklistKind: 'bike', flexible: true, notes: 'Por volta de 17:00, sujeito a disponibilidade.' }),
  p('parapente', { section: 'reserva', group: CT, title: 'Parapente', status: 'a_confirmar', certainty: 'clima', date: '2026-11-04', time: '16:00', notes: 'Por volta de 16:00, sujeito a vento.' }),
  p('gansbaai-hermanus', {
    section: 'reserva', group: CT, title: 'Gansbaai (shark cage) + Hermanus (baleias)', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-05',
    schoolImpact: 'dia', notes: 'Ausência escolar planejada. Só se os dois horários e o transfer forem compatíveis.',
  }),
  p('garden-route-hosp', { section: 'hospedagem', group: GR, title: 'Hospedagem Garden Route', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-06', endDate: '2026-11-08' }),
  p('garden-route-1', { section: 'roteiro', group: GR, title: 'Garden Route dia 1 — Wilderness / Knysna', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-06', schoolImpact: 'dia', notes: 'Ausência da manhã escolar (sexta).' }),
  p('bloukrans', {
    section: 'reserva', group: GR, title: 'Bloukrans bungee', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-07', clearance: 'pendente',
    notes: 'Só com liberação médica.',
  }),
  p('tsitsikamma', { section: 'roteiro', group: GR, title: 'Tsitsikamma', status: 'a_fazer', certainty: 'estimado', date: '2026-11-07' }),
  p('garden-route-volta', { section: 'transporte', group: GR, title: 'Retorno da Garden Route', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-08' }),
  p('snorkel-focas', {
    section: 'reserva', group: CT, title: 'Snorkel com focas', status: 'a_confirmar', certainty: 'clima', date: '2026-11-09', schoolImpact: 'parcial',
    notes: 'Cedo, se houver saída. Escola parcialmente; dia de recuperação.',
  }),
  p('stellenbosch-gravel', {
    section: 'esporte', group: CT, title: 'Stellenbosch gravel — 54 km, 675 m', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-10',
    schoolImpact: 'dia', checklistKind: 'bike', currency: 'ZAR', estimatedCents: 400000, notes: 'Ausência escolar planejada. Orçamento R4000.',
  }),
  p('stellenbosch-vinicola', { section: 'quero_ir', group: CT, title: 'Vinícola em Stellenbosch', status: 'a_fazer', certainty: 'estimado', date: '2026-11-10' }),
  p('discover-scuba', {
    section: 'reserva', group: CT, title: 'Discover Scuba em kelp (supervisionado)', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-11',
    schoolImpact: 'dia', checklistKind: 'scuba', notes: 'Possível ausência escolar adicional.',
  }),
  p('comunitaria', {
    section: 'roteiro', group: CT, title: 'Atividade comunitária ética', status: 'a_confirmar', certainty: 'pendente', date: '2026-11-12', checklistKind: 'voluntariado',
    notes: 'Só se houver projeto à tarde. Somente iniciativas guiadas pela comunidade, com regras de proteção infantil. Definir se é visita educativa ou voluntariado.',
  }),
  p('malas', { section: 'mala', group: 'Packing', title: 'Arrumar malas', status: 'a_fazer', date: '2026-11-12' }),
  p('check-out', { section: 'hospedagem', group: 'Accommodation', title: 'Check-out da residência', status: 'a_fazer', certainty: 'estimado', date: '2026-11-13', notes: 'Depois da escola (até 12:20), antes do SA366.' }),
  p('aeroporto-16', { section: 'transporte', group: 'Flights', title: 'Chegar ao aeroporto OR Tambo', status: 'a_fazer', certainty: 'estimado', date: '2026-11-16', time: '08:00', notes: 'Até ~08:00 para o voo das 11:10.' }),
  // Extras — not confirmed, never shown as done without her confirmation.
  p('robben-island', { section: 'quero_ir', group: CT, title: 'Robben Island', status: 'a_confirmar', certainty: 'pendente', booking: 'nao_pesquisado', optional: true, flexible: true, opportunityCost: 'Ocupa meio dia: entra no lugar de uma tarde livre ou de outra atividade.' }),
  p('district-six', { section: 'quero_ir', group: CT, title: 'District Six Museum', status: 'a_confirmar', certainty: 'pendente', booking: 'nao_pesquisado', optional: true, flexible: true, indoor: true, opportunityCost: 'Cabe numa tarde depois da aula; troca por uma tarde livre.' }),
  p('atlantis', { section: 'quero_ir', group: CT, title: 'Sandboard / quadriciclo em Atlantis', status: 'a_confirmar', certainty: 'pendente', booking: 'nao_pesquisado', optional: true, flexible: true, opportunityCost: 'Precisa de um bloco grande e transporte: provavelmente um fim de semana ou uma ausência escolar.' }),
  p('chapmans-bike', { section: 'quero_ir', group: CT, title: "Pedal guiado em Chapman's Peak", status: 'a_confirmar', certainty: 'pendente', booking: 'nao_pesquisado', optional: true, flexible: true, checklistKind: 'bike', opportunityCost: "Repete parte do caminho da excursão de 31/10." }),
  p('soweto', { section: 'quero_ir', group: 'Johannesburg', title: 'Tour histórico Soweto · Constitution Hill · Apartheid Museum', status: 'a_confirmar', certainty: 'pendente', booking: 'nao_pesquisado', optional: true, flexible: true, indoor: true, opportunityCost: 'Em Johannesburg os dias já têm voo e safári — exigiria trocar algo.' }),
  p('aquarium', { section: 'quero_ir', group: CT, title: 'Two Oceans Aquarium', status: 'a_confirmar', certainty: 'pendente', booking: 'nao_pesquisado', optional: true, flexible: true, indoor: true, opportunityCost: 'Boa troca para um dia de chuva ou vento.' }),
]

/** Payloads with stable ids (for tests and the seed itself). */
export function expeditionNewItems(): NewItem<'tripItems'>[] {
  return NEW_ITEMS.map(({ slug, ...x }, i) => {
    const out: NewItem<'tripItems'> = { ...x, id: zaId(slug), tripId: EXPEDITION_TRIP_ID, order: 1000 + i }
    for (const k of Object.keys(out) as (keyof typeof out)[]) if (out[k] === undefined) delete out[k]
    return out
  })
}

export const EXPEDITION_UPGRADE_IDS = UPGRADES.map((u) => u.id)

const untouched = (r: { createdAt: string; updatedAt: string }) => r.createdAt === r.updatedAt

/**
 * Idempotent and additive (see the header). Returns the SAME db object when there is nothing to do,
 * so boot doesn't rewrite storage.
 */
export function applyExpeditionSeed(db: DB, now: string = nowISO()): DB {
  const trip = db.trips.find((t) => t.id === EXPEDITION_TRIP_ID)
  if (!trip) return db
  let changed = false

  // Trip settings: added when missing; the start date only on a trip she never edited.
  let nextTrip: Trip = trip
  if (!trip.expedition) nextTrip = { ...nextTrip, expedition: expeditionSettings() }
  if (untouched(trip) && trip.startDate === '2026-10-22') nextTrip = { ...nextTrip, startDate: '2026-10-24' }
  if (nextTrip !== trip) {
    nextTrip = { ...nextTrip, updatedAt: now }
    changed = true
  }

  // Older seed items: upgrade while untouched, otherwise only fill expedition fields they don't have.
  const byId = new Map(UPGRADES.map((u) => [u.id, u]))
  const items = db.tripItems.map((r) => {
    const u = byId.get(r.id)
    if (!u) return r
    if (untouched(r) && r.title === u.oldTitle) {
      changed = true
      const next: TripItem = { ...r, ...u.next, id: r.id, tripId: r.tripId, order: r.order, createdAt: r.createdAt, updatedAt: now }
      return next
    }
    const fill: Partial<TripItem> = {}
    for (const [k, v] of Object.entries(u.enrich) as [keyof TripItem, unknown][]) if (r[k] === undefined) (fill as Record<string, unknown>)[k] = v
    if (!Object.keys(fill).length) return r
    changed = true
    return { ...r, ...fill, updatedAt: now }
  })

  // New items: once, never after a delete, never next to one of hers with the same title.
  const removed = new Set(db.profile.removedSeedIds ?? [])
  const have = new Set(items.map((i) => i.id))
  const titles = new Set(items.filter((i) => i.tripId === EXPEDITION_TRIP_ID).map((i) => normalize(i.title)))
  const additions: TripItem[] = []
  for (const n of expeditionNewItems()) {
    if (have.has(n.id!) || removed.has(n.id!) || titles.has(normalize(n.title))) continue
    additions.push({ ...n, id: n.id!, createdAt: now, updatedAt: now } as TripItem)
  }
  if (additions.length) changed = true

  if (!changed) return db
  return {
    ...db,
    trips: db.trips.map((t) => (t.id === trip.id ? nextTrip : t)),
    tripItems: [...items, ...additions],
  }
}
