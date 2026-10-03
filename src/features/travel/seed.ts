import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { NewItem, TripItem, TripSection } from '@/data/types'

/**
 * Travel seed — Marina's real trips (brief §24–31).
 * Only what she told us: no invented reservations, payments or prices. Every item that isn't
 * proven is 'a_confirmar' (shown as "revisar" in the Revisar view). Payment is its own field and
 * is never inferred from an itinerary.
 */
export const seedTravel: FeatureSeed = (ctx) => {
  const recife = ctx.make('trips', {
    id: SEED_IDS.tripRecife,
    name: 'Recife',
    flag: '🇧🇷',
    place: 'Recife, PE',
    dateLabel: 'data a confirmar',
    datesConfirmed: false,
    summary: 'Recife ☀️ — viagem própria. Data ainda a confirmar.',
    interests: [],
    tone: 'accent',
    links: [],
    notes: 'Datas ainda a confirmar.',
    status: 'planejando',
    order: 1,
  })

  const africa = ctx.make('trips', {
    id: SEED_IDS.tripAfrica,
    name: 'South Africa 2026',
    flag: '🇿🇦',
    place: 'Cape Town (base) · Johannesburg',
    startDate: '2026-10-22',
    endDate: '2026-11-16',
    datesConfirmed: true,
    summary: 'Um mês vivendo Cape Town: estudo, mar, montanha e gente nova — fechando com safari em Johannesburg.',
    interests: [
      'viver Cape Town',
      'intercâmbio/estudo',
      'surf',
      'corrida',
      'trail',
      'gravel/bike',
      'praias',
      'natureza',
      'social',
      'vinícolas',
      'safari',
      'produzir conteúdo',
    ],
    companions: 'maior parte solo',
    tone: 'sand',
    links: [],
    notes: 'Datas como período-base: 22/10 → 16/11. Reservas e pagamentos têm status próprio — nada é “pago” só por estar no roteiro.',
    status: 'planejando',
    order: 0,
  })

  const itacare = ctx.make('trips', {
    id: SEED_IDS.tripItacare,
    name: 'Réveillon — Itacaré',
    flag: '🌴',
    place: 'Itacaré, Bahia',
    dateLabel: 'fim de 2026 / Réveillon',
    datesConfirmed: false,
    summary: 'Virada de ano com mar, surf e amigos 🌊',
    interests: [],
    tone: 'sage',
    links: [],
    notes: 'Datas exatas a confirmar.',
    status: 'planejando',
    order: 2,
  })

  let order = 0
  const item = (
    tripId: string,
    slug: string,
    section: TripSection,
    group: string | undefined,
    title: string,
    extra: Partial<NewItem<'tripItems'>> = {},
  ): NewItem<'tripItems'> => ({
    id: seedId('travel', `${tripId}-${slug}`),
    tripId,
    section,
    group,
    title,
    status: 'a_confirmar' satisfies TripItem['status'],
    order: order++,
    ...extra,
  })

  // ── South Africa 2026 ─────────────────────────────────────────────────────
  const A = SEED_IDS.tripAfrica
  // Order follows the sub-areas of §25 so the group chips read in her order.
  const africaItems: NewItem<'tripItems'>[] = [
    // Cape Town
    item(A, 'atividades', 'quero_ir', 'Cape Town', 'Atividades'),
    item(A, 'natacao', 'esporte', 'Cape Town', 'Natação'),
    // School (§24 intercâmbio/estudo)
    item(A, 'escola', 'reserva', 'School', 'Escola / intercâmbio'),
    // Surf
    item(A, 'surf', 'esporte', 'Surf', 'Surf'),
    item(A, 'long-john', 'mala', 'Surf', 'Long john'),
    // Running · Trail · Gravel
    item(A, 'corrida', 'esporte', 'Running', 'Corrida'),
    item(A, 'trail', 'esporte', 'Trail', 'Trail'),
    item(A, 'bike-rental', 'reserva', 'Gravel / Cycling', 'Bike rental'),
    item(A, 'rotas', 'esporte', 'Gravel / Cycling', 'Possíveis rotas'),
    // Beaches · Wine · Social (§24)
    item(A, 'praias', 'quero_ir', 'Beaches', 'Praias'),
    item(A, 'vinicolas', 'quero_ir', 'Wine', 'Vinícolas'),
    item(A, 'social', 'quero_ir', 'Social', 'Vida social / rolês'),
    // Content
    item(A, 'equip-conteudo', 'mala', 'Content', 'Equipamento de conteúdo'),
    item(A, 'gopro', 'mala', 'Content', 'GoPro'),
    item(A, 'powerbank', 'mala', 'Content', 'Powerbank'),
    // Johannesburg / Safari — §26 itinerary: reservation AND payment a confirmar.
    item(A, 'ida-johannesburg', 'roteiro', 'Johannesburg', 'Ida para a região de Johannesburg', { date: '2026-11-13', paymentStatus: 'a_confirmar' }),
    item(A, 'confirmar-horarios', 'roteiro', 'Johannesburg', 'Confirmar horários'),
    item(A, 'safari-dias', 'roteiro', 'Safari', 'Safari', { date: '2026-11-14', endDate: '2026-11-15', paymentStatus: 'a_confirmar' }),
    item(A, 'safari', 'reserva', 'Safari', 'Reserva do safari'),
    // Flights
    item(A, 'voo-retorno', 'voo', 'Flights', 'Retorno internacional — voo 10:00, OR Tambo', {
      date: '2026-11-16',
      time: '10:00',
      paymentStatus: 'a_confirmar',
      notes: 'Horário de referência.',
    }),
    item(A, 'revisar-voo', 'voo', 'Flights', 'Revisar voo'),
    // Accommodation · Transport
    item(A, 'hosp-cape-town', 'hospedagem', 'Accommodation', 'Hospedagem Cape Town'),
    item(A, 'hosp-johannesburg', 'hospedagem', 'Accommodation', 'Hospedagem Johannesburg'),
    item(A, 'logistica-aeroporto', 'transporte', 'Transport', 'Logística aeroporto'),
    item(A, 'transfers', 'transporte', 'Transport', 'Transfers'),
    // Shopping · Packing
    item(A, 'esim', 'comprar', 'Shopping', 'Internet / eSIM'),
    item(A, 'packing', 'mala', 'Packing', 'Packing'),
    item(A, 'roupas', 'mala', 'Packing', 'Roupas'),
    item(A, 'equip-esportivo', 'mala', 'Packing', 'Equipamento esportivo'),
    // Documents — seguro/documentos from §27; passport/visa/vaccines are the pre-trip basics
    // for an international trip (not in the brief's TODO, so also a confirmar).
    item(A, 'seguro', 'documento', 'Documents', 'Seguro'),
    item(A, 'documentos', 'documento', 'Documents', 'Documentos'),
    item(A, 'passaporte', 'antes_de_ir', 'Documents', 'Passaporte e validade'),
    item(A, 'visto', 'antes_de_ir', 'Documents', 'Visto/requisitos de entrada'),
    item(A, 'vacinas', 'antes_de_ir', 'Documents', 'Vacinas/certificados'),
    // Budget (no values — just the to-review)
    item(A, 'dinheiro-cartoes', 'antes_de_ir', 'Budget', 'Dinheiro / cartões'),
  ]

  // ── Recife (§29) ──────────────────────────────────────────────────────────
  const R = SEED_IDS.tripRecife
  const recifeItems: NewItem<'tripItems'>[] = [
    item(R, 'voo', 'voo', undefined, 'Voo'),
    item(R, 'mala', 'mala', undefined, 'Mala'),
    item(R, 'compromissos', 'roteiro', undefined, 'Compromissos'),
    item(R, 'pessoas', 'quero_ir', undefined, 'Pessoas'),
    item(R, 'compras', 'comprar', undefined, 'Compras'),
    item(R, 'logistica', 'transporte', undefined, 'Logística'),
    item(R, 'retorno', 'transporte', undefined, 'Retorno / próximo deslocamento', { notes: 'A confirmar.' }),
  ]

  // ── Réveillon — Itacaré (§30) ─────────────────────────────────────────────
  const I = SEED_IDS.tripItacare
  const itacareItems: NewItem<'tripItems'>[] = [
    item(I, 'hospedagem', 'hospedagem', undefined, 'Hospedagem'),
    item(I, 'transporte', 'transporte', undefined, 'Transporte'),
    item(I, 'praias', 'quero_ir', undefined, 'Praias'),
    item(I, 'surf', 'esporte', undefined, 'Surf'),
    item(I, 'festas', 'quero_ir', undefined, 'Festas / rolês'),
    item(I, 'restaurantes', 'comida', undefined, 'Restaurantes'),
    item(I, 'packing', 'mala', undefined, 'Packing'),
    item(I, 'orcamento', 'antes_de_ir', undefined, 'Orçamento'),
    item(I, 'reservas', 'reserva', undefined, 'Reservas'),
  ]

  return {
    trips: [recife, africa, itacare],
    tripItems: [...africaItems, ...recifeItems, ...itacareItems].map((d) => ctx.make('tripItems', d)),
  }
}
