import type { FeatureSeed } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { NewItem, TripItem, TripSection } from '@/data/types'
import { defaultChecklistItems } from './selectors'

/**
 * Travel seeds. Only what Marina actually told us: no invented flights, hotels, dates or prices.
 * Everything not proven is 'a_confirmar'; to-dos (mala, checklist) are 'a_fazer'.
 */
export const seedTravel: FeatureSeed = (ctx) => {
  const recife = ctx.make('trips', {
    id: SEED_IDS.tripRecife,
    name: 'Recife',
    flag: '🇧🇷',
    place: 'Recife, PE',
    startDate: '2026-10-22',
    datesConfirmed: true,
    summary: 'Recife em outubro ☀️ — o resto a gente vai preenchendo.',
    interests: [],
    tone: 'accent',
    links: [],
    status: 'planejando',
    order: 0,
  })

  const africa = ctx.make('trips', {
    id: SEED_IDS.tripAfrica,
    name: 'África do Sul',
    flag: '🇿🇦',
    place: 'Cape Town (base) · Johannesburg (safari)',
    dateLabel: 'out/nov 2026',
    datesConfirmed: false,
    summary: 'Base principal em Cape Town com intercâmbio; etapa em Johannesburg para o safari.',
    interests: ['intercâmbio', 'Cape Town', 'surf', 'trail', 'corrida', 'gravel', 'bike', 'natureza', 'praias', 'vinícolas', 'vida social', 'safari'],
    companions: 'majoritariamente solo',
    tone: 'sand',
    links: [],
    status: 'planejando',
    order: 1,
  })

  const itacare = ctx.make('trips', {
    id: SEED_IDS.tripItacare,
    name: 'Itacaré',
    flag: '🇧🇷',
    place: 'Itacaré, BA',
    dateLabel: 'Réveillon 2026/27',
    datesConfirmed: false,
    summary: 'Viagem de fim de ano',
    interests: [],
    tone: 'sage',
    links: [],
    status: 'planejando',
    order: 2,
  })

  let order = 0
  const item = (
    tripId: string,
    section: TripSection,
    group: string | undefined,
    title: string,
    status: TripItem['status'] = 'a_confirmar',
  ): NewItem<'tripItems'> => ({ tripId, section, group, title, status, order: order++ })

  const A = SEED_IDS.tripAfrica
  const CT = 'Cape Town'
  const JNB = 'Johannesburg / Safari'
  const EQ = 'Equipment'
  const africaItems: NewItem<'tripItems'>[] = [
    item(A, 'reserva', CT, 'Escola / intercâmbio'),
    item(A, 'esporte', CT, 'Surf'),
    item(A, 'esporte', CT, 'Trilhas'),
    item(A, 'esporte', CT, 'Corrida'),
    item(A, 'esporte', CT, 'Bike / gravel'),
    item(A, 'quero_ir', CT, 'Praias'),
    item(A, 'quero_ir', CT, 'Vinícolas'),
    item(A, 'quero_ir', CT, 'Rolês'),
    item(A, 'transporte', JNB, 'Transporte até Johannesburg'),
    item(A, 'hospedagem', JNB, 'Hotel em Johannesburg'),
    item(A, 'reserva', JNB, 'Safari'),
    item(A, 'roteiro', JNB, 'Horários do safari'),
    item(A, 'reserva', JNB, 'Reservas do safari'),
    item(A, 'mala', EQ, 'GoPro', 'a_fazer'),
    item(A, 'mala', EQ, 'Acessórios GoPro', 'a_fazer'),
    item(A, 'mala', EQ, 'Powerbank', 'a_fazer'),
    item(A, 'mala', EQ, 'Equipamentos esportivos', 'a_fazer'),
    item(A, 'mala', EQ, 'Itens de viagem', 'a_fazer'),
  ]

  const checklists = [recife, africa, itacare].flatMap((t) => {
    const list = defaultChecklistItems(t, [], order)
    order += list.length
    return list
  })

  return {
    trips: [recife, africa, itacare],
    tripItems: [...africaItems, ...checklists].map((d) => ctx.make('tripItems', d)),
  }
}
