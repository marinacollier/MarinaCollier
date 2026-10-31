/**
 * ATUALIZAÇÃO MESTRE 31/10 — Marina's South Africa Command Center update (31/10/2026), applied ONCE to her
 * data on top of the Expedição (trip `trip-africa-do-sul`). Same rules as the module seeds:
 *
 * - runs once per install (`profile.tripUpdatesApplied` gets MASTER_1031_ID) and only from 31/10 on;
 * - existing records are reused, never duplicated: a field is replaced only while it still holds what the
 *   seed wrote (or the record was never edited since it was created) — what she changed stays hers;
 *   a field that is missing is filled. Her done/cancelled items are never reopened;
 * - new records use stable ids (`seed:za1031:*`), are never created after she deleted them
 *   (`profile.removedSeedIds`, which the sync turns into tombstones) and never next to one of hers with the
 *   same title;
 * - nothing invented: prices only where she wrote a reference (ZAR 475, ZAR 4.000, ZAR 4.810 as a caveat),
 *   no availability, weather, pickup or time she didn't give. Items without voucher stay PLANEJADO;
 *   RESERVADO only for Cape Point, which she says is booked (her word is recorded as the proof).
 *
 * Returns the SAME db object when there is nothing to do.
 */
import type { DateKey, DB, Task, Trip, TripItem, Workout } from '../types'
import { SEED_IDS } from './ids'
import { expeditionSeedValues, zaId } from './expedition'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'

export const MASTER_1031_ID = 'za-2026-10-31'
export const MASTER_1031_FROM: DateKey = '2026-10-31'
const TRIP = SEED_IDS.tripAfrica
const FF = SEED_IDS.projFashionFinder
export const m31Id = (slug: string) => `seed:za1031:${slug}`
const oldId = (slug: string) => `seed:travel:${TRIP}-${slug}`

const CT = 'Cape Town'
const GR = 'Garden Route'
const JNB = 'Johannesburg / Safari'

type ItemPatch = Partial<Omit<TripItem, 'id' | 'tripId' | 'createdAt' | 'updatedAt'>>
type NewTripItem = ItemPatch & Pick<TripItem, 'section' | 'title' | 'status'>

// ─── Section 3 · done (no booking tasks) ────────────────────────────────────

/** Existing items she has done: marked CONCLUÍDO when still open (her own done/cancel stays). */
const DONE_EXISTING: { id: string; label: string }[] = [
  { id: zaId('lions-head'), label: "Lion's Head" },
  { id: oldId('surf'), label: 'Surf em Muizenberg' },
  { id: oldId('natacao'), label: 'Natação em Sea Point' },
  { id: zaId('camps-bay'), label: 'Camps Bay' },
  { id: 'marina:za:2026-10-29-watershed', label: 'Waterfront / Watershed' },
]
/** Done experiences without a record yet: minimal done records (no date she didn't give). */
const DONE_NEW: { slug: string; title: string; section: TripItem['section']; aliases: string[] }[] = [
  { slug: 'clifton-beach', title: 'Clifton Beach', section: 'quero_ir', aliases: ['clifton'] },
  { slug: 'feirinhas', title: 'Feirinhas locais', section: 'quero_ir', aliases: ['feirinha'] },
  // Only created when the reused records above are gone.
  { slug: 'lions-head', title: "Lion's Head", section: 'esporte', aliases: ["lion's head", 'lions head'] },
  { slug: 'surf-muizenberg', title: 'Surf em Muizenberg', section: 'esporte', aliases: ['surf muizenberg', 'surf em muizenberg'] },
  { slug: 'natacao-sea-point', title: 'Natação em Sea Point', section: 'esporte', aliases: ['natacao'] },
  { slug: 'camps-bay', title: 'Camps Bay', section: 'quero_ir', aliases: ['camps bay'] },
  { slug: 'watershed', title: 'Waterfront / Watershed', section: 'quero_ir', aliases: ['watershed'] },
]

// ─── Sections 2, 4, 5, 6, 7 · existing items rebuilt ────────────────────────

const OPT = { optional: true, bookingStatus: 'opcional' as const, date: undefined, time: undefined, endTime: undefined, schoolImpact: undefined }

/** Updates of existing records (applied field by field — see `settable`). */
const UPDATES: { id: string; patch: ItemPatch }[] = [
  {
    id: zaId('cape-point'),
    patch: {
      title: 'Cape Point · Cabo da Boa Esperança · Boulders Beach',
      date: '2026-11-01',
      time: '09:45',
      endTime: undefined,
      status: 'confirmado',
      booking: 'confirmado',
      certainty: 'confirmado',
      bookingStatus: 'reservado',
      proof: 'Reserva informada pela Marina em 31/10 — anexar o voucher quando tiver.',
      address: '81 Long Street, Cape Town',
      pickup: 'Saída prevista de 81 Long Street às 09:45',
      priority: 'P0',
      category: 'tours',
      paymentStatus: 'a_confirmar',
      nextAction: 'Estar em 81 Long Street antes das 09:45 e salvar o voucher offline',
      notes: 'Passeio reservado para domingo, 01/11. Entrada dos pinguins é separada (item próprio).',
    },
  },
  { id: zaId('bo-kaap'), patch: { date: '2026-11-02', bookingStatus: 'planejado', priority: 'P2', category: 'tours', notes: 'Depois da aula. Sem reserva.' } },
  {
    id: zaId('table-mountain'),
    patch: {
      section: 'roteiro',
      date: '2026-11-03',
      time: undefined,
      certainty: 'clima',
      bookingStatus: 'a_reservar',
      priority: 'P1',
      category: 'tours',
      currency: 'ZAR',
      estimatedCents: 47500,
      url: 'https://www.tablemountain.net/plan-your-visit/buy-tickets',
      nextAction: 'Ver previsão de vento e operação do teleférico; então comprar online',
      deadline: '2026-11-03',
      caveat: 'ZAR 475 ida e volta online é referência, não disponibilidade garantida',
      notes: 'Depois da aula, conforme clima. Reservar após verificar previsão de vento e operação do teleférico.',
    },
  },
  {
    id: zaId('gansbaai-hermanus'),
    patch: {
      title: 'Mergulho com tubarões — Gansbaai',
      date: '2026-11-04',
      schoolImpact: undefined,
      certainty: 'clima',
      bookingStatus: 'a_cotar',
      priority: 'P0',
      category: 'tours',
      url: 'https://sharkwatchsa.com/',
      nextAction: 'Confirmar funcionamento no feriado, condições marítimas, transfer e preço final',
      deadline: '2026-11-02',
      notes: 'Data preferencial: 04/11 (feriado eleitoral, sem aula — não é falta). Dia inteiro. Opções: https://sharkwatchsa.com/ · https://sharkcagediving.co.za/',
    },
  },
  {
    id: zaId('garden-route-1'),
    patch: {
      title: 'Garden Route — saída de Cape Town',
      date: '2026-11-07',
      schoolImpact: undefined,
      bookingStatus: 'a_cotar',
      priority: 'P0',
      category: 'tours',
      url: 'https://www.sanparks.org/parks/garden-route',
      nextAction: 'Solicitar roteiro, hospedagem, transporte, seguro, política de cancelamento e preço final',
      deadline: '2026-11-04',
      notes: 'Janela proposta 07–09/11. Incluir Knysna, Plettenberg Bay, Tsitsikamma e Bloukrans se viável.',
    },
  },
  {
    id: zaId('garden-route-hosp'),
    patch: { date: '2026-11-07', endDate: '2026-11-09', bookingStatus: 'a_cotar', priority: 'P0', category: 'hospedagem', nextAction: 'Vem junto da cotação da Garden Route', deadline: '2026-11-04' },
  },
  {
    id: zaId('tsitsikamma'),
    patch: { title: 'Tsitsikamma, Bloukrans e passeios de natureza', date: '2026-11-08', bookingStatus: 'planejado', priority: 'P1', category: 'tours' },
  },
  {
    id: zaId('bloukrans'),
    patch: {
      title: 'Bloukrans bungee',
      date: '2026-11-08',
      optional: true,
      bookingStatus: 'opcional',
      clearance: 'pendente',
      priority: 'P2',
      category: 'treinos',
      url: 'https://bloukransbungy.com/',
      nextAction: 'Não reservar sem autorização médica e aceitação formal da operadora',
      notes: 'Histórico de cirurgias ligamentares e meniscais no joelho esquerdo: o bungee não é recomendado sem liberação médica e aceitação formal da operadora.',
    },
  },
  {
    id: zaId('garden-route-volta'),
    patch: {
      date: '2026-11-09',
      schoolImpact: 'dia',
      bookingStatus: 'a_cotar',
      priority: 'P0',
      category: 'transfers',
      nextAction: 'Incluir na cotação da Garden Route; pedir confirmação da falta à escola',
      notes: 'Segunda-feira: falta na Bayswater (sinalizada) — pedir confirmação à escola.',
    },
  },
  {
    id: zaId('stellenbosch-gravel'),
    patch: {
      title: 'Pedal gravel Stellenbosch — Cape Velo (54 km, 675 m)',
      date: undefined,
      schoolImpact: undefined,
      supplier: 'Cape Velo',
      bookingStatus: 'aguardando_resposta',
      priority: 'P1',
      category: 'treinos',
      nextAction: 'Acompanhar resposta: data, valor, itinerário, pickup e política de cancelamento',
      deadline: '2026-11-05',
      caveat: 'ZAR 4.000 é referência de proposta anterior (com equipamentos e suporte)',
      notes: 'Solicitação já enviada à Cape Velo. Evitar conflito com a Garden Route (07–09/11).',
    },
  },
  {
    id: zaId('stellenbosch-vinicola'),
    patch: {
      title: 'Vinícolas — Stellenbosch e/ou Franschhoek',
      date: undefined,
      bookingStatus: 'planejado',
      priority: 'P2',
      category: 'tours',
      url: 'https://www.winetram.co.za/',
      nextAction: 'Planejar depois da confirmação do pedal e da Garden Route',
      notes: 'Comprar aqui o vinho do Matheus, se der.',
    },
  },
  { id: zaId('kirstenbosch'), patch: { date: '2026-11-10', time: undefined, bookingStatus: 'planejado', priority: 'P2', category: 'tours', nextAction: 'Verificar ingresso, horários e deslocamento', notes: 'Jardins botânicos, depois da aula.' } },
  {
    id: zaId('kalk-bay'),
    patch: {
      date: '2026-11-11',
      time: undefined,
      bookingStatus: 'planejado',
      priority: 'P2',
      category: 'tours',
      notes: 'Dalebrook Tidal Pool, porto, cafés e lojas. Sem reserva (passeio independente). De dia, se compatível com o horário escolar.',
    },
  },
  { id: zaId('malas'), patch: { date: '2026-11-12', bookingStatus: 'planejado', priority: 'P1' } },
  { id: zaId('check-out'), patch: { date: '2026-11-13', bookingStatus: 'planejado', priority: 'P0', category: 'hospedagem' } },
  { id: zaId('aeroporto-16'), patch: { bookingStatus: 'planejado', priority: 'P0', nextAction: 'Conferir logística do voo internacional' } },
  // Section 6 · optional (not prioritised over commitments, rest or training).
  { id: zaId('parapente'), patch: { ...OPT, category: 'tours' } },
  { id: zaId('caiaque'), patch: { ...OPT, category: 'tours' } },
  { id: zaId('snorkel-focas'), patch: { ...OPT, category: 'tours' } },
  { id: zaId('robben-island'), patch: { ...OPT, category: 'tours' } },
  // Not in the plan of 31/10: off the calendar, kept as extras (nothing cancelled for her).
  { id: zaId('bike-urbana'), patch: { ...OPT, caveat: 'Fora do roteiro de 31/10' } },
  { id: zaId('discover-scuba'), patch: { ...OPT, caveat: 'Fora do roteiro de 31/10' } },
  { id: zaId('comunitaria'), patch: { ...OPT, caveat: 'Fora do roteiro de 31/10' } },
  // Section 2 · flights as registered.
  {
    id: oldId('ida-johannesburg'),
    patch: { caveat: 'Horário registrado (19:35–21:35), sujeito à conferência do bilhete', priority: 'P0', nextAction: 'Conferir bilhete e check-in', deadline: '2026-11-12' },
  },
  {
    id: oldId('voo-retorno'),
    patch: { caveat: 'Horário registrado (11:10), sujeito à conferência do bilhete', priority: 'P0', nextAction: 'Conferir bilhete, check-in e logística do voo internacional', deadline: '2026-11-15' },
  },
  // Section 7 · Johannesburg (P0).
  {
    id: oldId('hosp-johannesburg'),
    patch: {
      title: 'Hotel OR Tambo · 13→14/11',
      group: JNB,
      date: '2026-11-13',
      endDate: '2026-11-14',
      bookingStatus: 'a_reservar',
      priority: 'P0',
      category: 'hospedagem',
      url: 'https://citylodgehotels.com/',
      nextAction: 'Reservar City Lodge OR Tambo ou InterContinental OR Tambo',
      deadline: '2026-11-06',
      notes:
        'Perto ou dentro do complexo OR Tambo. Chegada noturna; evitar deslocamentos longos. Preferências: City Lodge OR Tambo (https://citylodgehotels.com/) ou InterContinental OR Tambo (https://www.ihg.com/). Confirmar check-in tardio, acesso a partir do terminal e recepção 24 horas.',
    },
  },
  {
    id: oldId('safari-dias'),
    patch: {
      group: JNB,
      supplier: 'Pilanesberg · Kwa Maritane Bush Lodge',
      time: undefined,
      endTime: undefined,
      pickup: undefined,
      needsPickup: undefined,
      pickupConfirmed: undefined,
      bookingStatus: 'planejado',
      priority: 'P0',
      category: 'safari',
      nextAction: 'Confirmar horários exatos dos game drives antes de contratar o transfer',
      notes: 'Priorizar dois game drives: sábado à tarde (14/11) e domingo cedo (15/11). Depende da resposta do Kwa Maritane.',
    },
  },
]

/** Reuse an existing generic record when it is still the seed's (untouched); otherwise create `id`. */
const REUSE_OR_CREATE: { reuse: string; slug: string; item: NewTripItem }[] = [
  {
    reuse: oldId('safari'),
    slug: 'kwa-maritane',
    item: {
      section: 'hospedagem',
      group: JNB,
      title: 'Kwa Maritane Bush Lodge · Pilanesberg · 14→15/11',
      status: 'a_confirmar',
      booking: 'aguardando',
      bookingStatus: 'aguardando_resposta',
      date: '2026-11-14',
      endDate: '2026-11-15',
      priority: 'P0',
      category: 'safari',
      supplier: 'Kwa Maritane Bush Lodge',
      url: 'https://www.legacyhotels.co.za/kwa-maritane-bush-lodge',
      paymentStatus: 'a_confirmar',
      nextAction: 'Acompanhar a resposta do hotel (tarifa, refeições, game drives, transfer, taxas, cancelamento)',
      deadline: '2026-11-05',
      caveat: 'ZAR 4.810 era referência anterior — não é preço garantido para tarifa elegível',
      notes: [
        'AGUARDANDO RESPOSTA DO HOTEL. Perguntas já enviadas sobre tarifa, refeições, game drives, transfer, taxas e cancelamento.',
        'Não reservar Golden Years: tarifa exclusiva para residentes sul-africanos com 60 anos ou mais.',
        'Avaliar Lifestyle Rewards somente após confirmar elegibilidade e inclusão de safári.',
        'Priorizar dois game drives: sábado à tarde e domingo cedo. Confirmar horários exatos antes de contratar transfer.',
        'Solicitar quarto com vista para natureza, se disponível. Confirmar acesso ao observatório de animais.',
      ].join('\n'),
    },
  },
  {
    reuse: oldId('transfers'),
    slug: 'transfer-pilanesberg',
    item: {
      section: 'transporte',
      group: JNB,
      title: 'Transfer OR Tambo ↔ Pilanesberg (ida e volta)',
      status: 'a_confirmar',
      booking: 'nao_pesquisado',
      bookingStatus: 'a_cotar',
      date: '2026-11-14',
      endDate: '2026-11-15',
      priority: 'P0',
      category: 'transfers',
      nextAction: 'Pedir preço para uma pessoa, ida e volta — depois dos horários dos game drives',
      deadline: '2026-11-09',
      notes: 'Transporte profissional de OR Tambo a Pilanesberg e retorno. Confirmar motorista, contato, pickup, bagagem e condições de cancelamento. Evitar deslocamentos improvisados à noite.',
    },
  },
]

/** New trip items (stable ids). */
const NEW_ITEMS: { slug: string; item: NewTripItem }[] = [
  {
    slug: 'boulders-pinguins',
    item: {
      section: 'reserva',
      group: CT,
      title: 'Entrada Boulders Beach (pinguins)',
      status: 'a_confirmar',
      booking: 'nao_pesquisado',
      bookingStatus: 'a_cotar',
      date: '2026-11-01',
      priority: 'P1',
      category: 'tours',
      paymentStatus: 'pendente',
      nextAction: 'Pagar no local — valor a confirmar',
      notes: 'Entrada separada do passeio de Cape Point.',
    },
  },
  {
    slug: 'prep-garden-route',
    item: { section: 'roteiro', group: GR, title: 'Preparação para a Garden Route', status: 'a_fazer', bookingStatus: 'planejado', date: '2026-11-06', priority: 'P1', notes: 'Depois da aula e da natação: mala pequena, documentos e vouchers offline.' },
  },
  {
    slug: 'hotel-or-tambo-15',
    item: {
      section: 'hospedagem',
      group: JNB,
      title: 'Hotel OR Tambo · 15→16/11',
      status: 'a_confirmar',
      bookingStatus: 'a_reservar',
      date: '2026-11-15',
      endDate: '2026-11-16',
      priority: 'P0',
      category: 'hospedagem',
      url: 'https://citylodgehotels.com/',
      nextAction: 'Reservar hotel próximo a OR Tambo',
      deadline: '2026-11-06',
      notes: 'Retornar de Pilanesberg com margem de segurança. Descansar antes do voo internacional.',
    },
  },
  { slug: 'hermanus', item: { section: 'quero_ir', group: CT, title: 'Hermanus (baleias)', status: 'a_confirmar', optional: true, bookingStatus: 'opcional', category: 'tours', caveat: 'Não está no roteiro de 31/10' } },
  // Section 6 · optional experiences not on the list yet.
  { slug: 'por-do-sol', item: { section: 'quero_ir', group: CT, title: 'Pôr do sol em mirantes', status: 'a_confirmar', optional: true, bookingStatus: 'opcional', flexible: true } },
  { slug: 'surf-adicional', item: { section: 'esporte', group: CT, title: 'Surf adicional', status: 'a_confirmar', optional: true, bookingStatus: 'opcional', checklistKind: 'surf', category: 'treinos', flexible: true } },
  { slug: 'museus-feirinhas', item: { section: 'quero_ir', group: CT, title: 'Museus e feirinhas extras', status: 'a_confirmar', optional: true, bookingStatus: 'opcional', flexible: true } },
  // Section 11 · shopping (persons + categories; no prices).
  ...(
    [
      ['whisky-luquinhas', 'Whisky para Luquinhas', 'Luquinhas', 'presentes', 'Verificar regras de bebidas alcoólicas, alfândega e franquia antes de comprar.'],
      ['vinho-matheus', 'Vinho sul-africano para Matheus', 'Matheus', 'presentes', 'Preferir comprar durante o passeio às vinícolas.'],
      ['souvenir-rebeca', 'Souvenir para Rebeca', 'Rebeca', 'presentes', undefined],
      ['lembrancas', 'Lembranças para família e amigos', 'Família e amigos', 'presentes', undefined],
      ['canga', 'Canga para Marina', 'Marina', 'compras', undefined],
      ['mala-extra', 'Mala adicional ou solução de bagagem', 'Marina', 'bagagem', 'Comprar a mala somente após conferir peso, dimensões e custo de despacho.'],
      ['protecao-garrafas', 'Proteção para garrafas', 'Marina', 'bagagem', undefined],
      ['itens-faltantes', 'Eventuais itens de viagem faltantes', 'Marina', 'compras', undefined],
    ] as const
  ).map(([slug, title, person, category, notes]) => ({
    slug,
    item: { section: 'comprar', group: 'Compras e souvenirs', title, person, category, status: 'a_fazer', bookingStatus: 'planejado', priority: 'P2', deadline: '2026-11-12', notes } as NewTripItem,
  })),
  {
    slug: 'regras-bagagem',
    item: {
      section: 'antes_de_ir',
      group: 'Compras e souvenirs',
      title: 'Verificar regras de líquidos, bebidas alcoólicas, alfândega e franquia de bagagem das companhias',
      status: 'a_fazer',
      bookingStatus: 'planejado',
      priority: 'P1',
      category: 'bagagem',
      deadline: '2026-11-10',
      notes: 'Antes de comprar bebidas e a mala extra.',
    },
  },
  // Section 12 · safety checklist (persistent, tickable).
  ...(
    [
      ['hoteis-confiaveis', 'Priorizar hotéis confiáveis, com recepção e transporte organizado'],
      ['noite', 'Não caminhar sozinha à noite em locais desconhecidos'],
      ['transporte-confiavel', 'Usar transporte de fornecedor confiável'],
      ['compartilhar-roteiro', 'Compartilhar roteiro e contatos com familiar'],
      ['documentos-offline', 'Salvar vouchers, passagens, seguro e documentos offline'],
      ['celular', 'Manter celular carregado, powerbank e internet'],
      ['localizacao', 'Não divulgar publicamente a localização da hospedagem em tempo real'],
      ['seguro-aventura', 'Conferir cobertura do seguro para esportes de aventura'],
      ['dinheiro', 'Não carregar grandes quantias de dinheiro'],
      ['aeroporto-margem', 'Confirmar chegada ao aeroporto com margem adequada'],
    ] as const
  ).map(([slug, title]) => ({ slug: `seg-${slug}`, item: { section: 'antes_de_ir', group: 'Segurança', title, status: 'a_fazer', bookingStatus: 'planejado' } as NewTripItem })),
]

// ─── Section 8 · training on the itinerary (trip workouts; no session on big-adventure days) ──

const KNEE = 'Joelho esquerdo (cirurgias ligamentares e meniscais): inferior adaptado, seguindo a orientação da fisioterapia e da ortopedia.'
const WORKOUTS: { slug: string; w: Pick<Workout, 'date' | 'modality' | 'title'> & Partial<Workout> }[] = [
  { slug: 'treino-2026-11-01-mobilidade', w: { date: '2026-11-01', modality: 'mobilidade', title: 'Mobilidade e recuperação', intensity: 'leve', period: 'noite', sessionType: 'mobilidade', notes: 'Leve, depois do Cape Point.' } },
  { slug: 'treino-2026-11-02-superior', w: { date: '2026-11-02', modality: 'musculacao', title: 'Força superior (1/2)', period: 'tarde', sessionType: 'forca', notes: 'Depois da aula e do Bo-Kaap.' } },
  { slug: 'treino-2026-11-03-corrida', w: { date: '2026-11-03', modality: 'corrida', title: 'Corrida leve', intensity: 'leve', period: 'manha', sessionType: 'endurance', notes: 'Antes da aula. Sem intensidade: amanhã é o mergulho com tubarões.' } },
  { slug: 'treino-2026-11-05-inferior', w: { date: '2026-11-05', modality: 'musculacao', title: 'Força inferior adaptada', intensity: 'leve', period: 'tarde', sessionType: 'forca', tags: ['joelho'], notes: KNEE } },
  { slug: 'treino-2026-11-06-natacao', w: { date: '2026-11-06', modality: 'natacao', title: 'Natação', period: 'tarde', sessionType: 'endurance', notes: 'Sem acumular carga antes da Garden Route.' } },
  { slug: 'treino-2026-11-10-superior', w: { date: '2026-11-10', modality: 'musculacao', title: 'Força superior (2/2)', period: 'tarde', sessionType: 'forca' } },
  { slug: 'treino-2026-11-11-corrida', w: { date: '2026-11-11', modality: 'corrida', title: 'Corrida leve', intensity: 'leve', period: 'tarde', sessionType: 'endurance' } },
  { slug: 'treino-2026-11-12-yoga', w: { date: '2026-11-12', modality: 'yoga', title: 'Yoga', intensity: 'leve', sessionType: 'mobilidade' } },
]

// ─── Sections 2, 10, 14 · tasks (alerts with deadlines, school, Fashion Finder blocks) ──

type NewTask = Pick<Task, 'title'> & Partial<Task>
const alert = (slug: string, t: NewTask): { slug: string; task: NewTask } => ({
  slug: `alerta-${slug}`,
  task: { status: 'todo', tripId: TRIP, context: 'viagem', tags: ['alerta', 'viagem'], ...t },
})
const ALERTS: { slug: string; task: NewTask; reuse?: string }[] = [
  alert('kwa-maritane', { title: 'Acompanhar resposta do Kwa Maritane', priority: 'alta', date: '2026-11-02', dueDate: '2026-11-05', notes: 'Sem resposta: cobrar o hotel. Não reservar Golden Years.' }),
  alert('cape-velo', { title: 'Acompanhar resposta da Cape Velo', priority: 'media', date: '2026-11-02', dueDate: '2026-11-05', notes: 'Data, valor, itinerário, pickup e cancelamento — sem conflito com a Garden Route.' }),
  {
    ...alert('hoteis-jnb', { title: 'Reservar hotéis de 13 e 15/11 (OR Tambo)', priority: 'alta', date: '2026-11-02', dueDate: '2026-11-06', notes: 'City Lodge OR Tambo ou InterContinental OR Tambo: check-in tardio, acesso a partir do terminal, recepção 24 h.' }),
    reuse: 'seed:backlog:resolver-hospedagem-e-safari-jnb',
  },
  alert('transfer-safari', { title: 'Confirmar transfer do safári (OR Tambo ↔ Pilanesberg)', priority: 'alta', date: '2026-11-05', dueDate: '2026-11-09', notes: 'Depois dos horários dos game drives. Motorista, contato, pickup, bagagem e cancelamento.' }),
  alert('clima', {
    title: 'Verificar clima antes de Table Mountain e atividades marítimas',
    priority: 'alta',
    date: '2026-11-02',
    dueDate: '2026-11-03',
    checklist: [
      { id: 'tm', title: 'Table Mountain (03/11): vento e operação do teleférico', done: false },
      { id: 'mar', title: 'Tubarões (04/11): condições do mar e saída no feriado', done: false },
    ],
  }),
  alert('garden-route', { title: 'Confirmar Garden Route (07–09/11)', priority: 'alta', date: '2026-11-02', dueDate: '2026-11-04', notes: 'Roteiro, hospedagem, transporte, seguro, cancelamento e preço final.' }),
  alert('bungee-medico', { title: 'Solicitar autorização médica para o bungee', priority: 'media', date: '2026-11-02', dueDate: '2026-11-06', notes: 'Sem liberação médica e aceitação formal da operadora, nada de bungee (joelho esquerdo).' }),
  alert('souvenirs', { title: 'Comprar souvenirs antes de 12/11', priority: 'media', date: '2026-11-10', dueDate: '2026-11-11', notes: 'Ver a lista de compras por pessoa (Expedição → Compras).' }),
  alert('mala-extra', { title: 'Resolver mala extra antes do voo doméstico', priority: 'media', date: '2026-11-11', dueDate: '2026-11-12', notes: 'Comprar só depois de conferir peso, dimensões e custo de despacho.' }),
  alert('passagens', { title: 'Conferir passagens e check-in', priority: 'alta', date: '2026-11-11', dueDate: '2026-11-12', notes: 'SA366 de 13/11 e internacional de 16/11: horários registrados sujeitos à conferência do bilhete.' }),
  alert('documentos-bagagem', { title: 'Organizar documentos e bagagem antes de 13/11', priority: 'alta', date: '2026-11-12', dueDate: '2026-11-12' }),
  alert('voo-internacional', { title: 'Conferir logística do voo internacional de 16/11', priority: 'alta', date: '2026-11-15', dueDate: '2026-11-15', notes: 'Hotel OR Tambo → terminal com margem.' }),
  alert('escola-09', { title: 'Pedir confirmação à escola: falta na segunda 09/11 (Garden Route)', priority: 'media', date: '2026-11-02', dueDate: '2026-11-06' }),
]

/** Fashion Finder priorities placed as 45–90 min blocks on light weekdays (never 04, 07–09, 13–16/11). */
const FF_TASKS: { slug: string; reuse?: string; task: NewTask }[] = [
  { slug: 'ff-mensagens', task: { title: 'Verificar mensagens urgentes de Francine e Lucas', date: '2026-11-02', durationMin: 15 } },
  { slug: 'ff-mvp', task: { title: 'Acompanhar lançamento do MVP', date: '2026-11-02', durationMin: 45 } },
  { slug: 'ff-contas', reuse: 'seed:backlog:solucionar-conta-google', task: { title: 'Resolver contas Apple e Google', date: '2026-11-05', durationMin: 45 } },
  { slug: 'ff-publicacao', task: { title: 'Acompanhar publicação e teste interno do aplicativo', date: '2026-11-05', durationMin: 45 } },
  { slug: 'ff-busca', task: { title: 'Revisar motor de busca e calibragem', date: '2026-11-06', durationMin: 60 } },
  { slug: 'ff-marketing', task: { title: 'Acompanhar marketing e mídia', date: '2026-11-10', durationMin: 45 } },
  { slug: 'ff-pj-linkedin', reuse: 'seed:backlog:criar-conta-pj-para-fashion-finder', task: { title: 'Estruturar próximos passos da conta PJ e LinkedIn', date: '2026-11-11', durationMin: 45 } },
  { slug: 'ff-retorno', task: { title: 'Organizar pendências para o retorno ao Brasil', date: '2026-11-12', durationMin: 45 } },
]

// ─── Trip settings (section 2 + 9) ──────────────────────────────────────────

const HOLIDAY = { date: '2026-11-04', label: 'Feriado eleitoral — sem aula' }
const FOCUS = ['Conversação', 'Pronúncia', 'Ritmo e word stress', 'Perguntas com do/does', 'Futuro', 'Artigos', 'Preposições', 'Fluência', 'Vocabulário de turismo, reservas, segurança e trabalho']

// ─── Apply ──────────────────────────────────────────────────────────────────

const edited = (r: { createdAt: string; updatedAt: string }) => r.createdAt !== r.updatedAt
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * A field may be replaced when it is empty, the record was never edited since it was created, or it still
 * holds exactly what the expedition seed wrote. Status never reopens what she closed.
 */
function settable(r: TripItem, k: keyof TripItem, seed: Partial<TripItem> | undefined, next: unknown): boolean {
  const cur = r[k]
  if (same(cur, next)) return false
  if (k === 'status' && (cur === 'feito' || cur === 'cancelado')) return false
  if (cur === undefined) return true
  if (!edited(r)) return true
  return !!seed && k in seed && same(cur, seed[k])
}

function patchItem(r: TripItem, patch: ItemPatch, seed: Partial<TripItem> | undefined, now: string): TripItem {
  let out: TripItem | undefined
  for (const [k, v] of Object.entries(patch) as [keyof TripItem, unknown][]) {
    if (!settable(r, k, seed, v)) continue
    out ??= { ...r }
    if (v === undefined) delete (out as unknown as Record<string, unknown>)[k]
    else (out as unknown as Record<string, unknown>)[k] = v
  }
  return out ? { ...out, updatedAt: now } : r
}

const clean = <T extends object>(o: T): T => {
  const out = { ...o }
  for (const k of Object.keys(out) as (keyof T)[]) if (out[k] === undefined) delete out[k]
  return out
}

/** Done in her words: mark CONCLUÍDO unless she already closed it (done stays done, cancelled stays). */
function markDone(r: TripItem, now: string): TripItem {
  if (r.status === 'feito' || r.status === 'cancelado') return r
  return { ...r, status: 'feito', booking: 'concluido', bookingStatus: 'concluido', updatedAt: now }
}

export function needsMaster1031(db: DB, today: DateKey): boolean {
  return today >= MASTER_1031_FROM && !db.profile.tripUpdatesApplied?.includes(MASTER_1031_ID)
}

export function applyMaster1031(db: DB, today: DateKey, now: string = nowISO()): DB {
  if (!needsMaster1031(db, today)) return db
  const profile = { ...db.profile, tripUpdatesApplied: [...(db.profile.tripUpdatesApplied ?? []), MASTER_1031_ID] }
  const trip = db.trips.find((t) => t.id === TRIP)
  if (!trip) return { ...db, profile }

  const removed = new Set(db.profile.removedSeedIds ?? [])
  const seedValues = expeditionSeedValues()
  const items = new Map(db.tripItems.map((i) => [i.id, i]))
  const added: TripItem[] = []
  const tripTitles = () => new Set([...items.values(), ...added].filter((i) => i.tripId === TRIP).map((i) => normalize(i.title)))
  let order = Math.max(3000, ...db.tripItems.filter((i) => i.tripId === TRIP).map((i) => i.order)) + 1

  const create = (slug: string, x: NewTripItem) => {
    const id = m31Id(slug)
    if (items.has(id) || removed.has(id) || added.some((a) => a.id === id) || tripTitles().has(normalize(x.title))) return
    added.push(clean({ ...x, id, tripId: TRIP, order: order++, createdAt: now, updatedAt: now }) as TripItem)
  }

  // 3 · done experiences.
  for (const d of DONE_EXISTING) {
    const r = items.get(d.id)
    if (r) items.set(d.id, markDone(r, now))
  }
  const have = (aliases: string[]) => [...items.values(), ...added].some((i) => i.tripId === TRIP && aliases.some((a) => normalize(i.title).includes(normalize(a))) && i.status === 'feito')
  for (const d of DONE_NEW) {
    if (have([d.title, ...d.aliases])) continue
    create(d.slug, { section: d.section, group: CT, title: d.title, status: 'feito', booking: 'concluido', bookingStatus: 'concluido', notes: 'Concluído (Atualização mestre 31/10).' })
  }

  // 4–7 · the itinerary rebuilt on the existing records.
  for (const u of UPDATES) {
    const r = items.get(u.id)
    // What she already closed (done / cancelled) stays exactly as she left it.
    if (r && r.status !== 'feito' && r.status !== 'cancelado') items.set(u.id, patchItem(r, u.patch, seedValues.get(u.id), now))
  }
  for (const x of REUSE_OR_CREATE) {
    const r = items.get(x.reuse)
    // A generic record she never edited becomes this item; one she edited stays hers and a new one is made.
    if (r && !edited(r) && r.status !== 'feito' && r.status !== 'cancelado') items.set(r.id, { ...r, ...clean(x.item), id: r.id, tripId: r.tripId, order: r.order, createdAt: r.createdAt, updatedAt: now })
    else create(x.slug, x.item)
  }
  for (const n of NEW_ITEMS) create(n.slug, n.item)

  // Trip settings: holiday and study focus, only when missing.
  let nextTrip: Trip = trip
  const school = trip.expedition?.school
  if (trip.expedition && school) {
    const patch = {
      ...(school.holidays?.some((h) => h.date === HOLIDAY.date) ? {} : { holidays: [...(school.holidays ?? []), HOLIDAY] }),
      ...(school.reviewMinutes ? {} : { reviewMinutes: '15–20 minutos por dia, quando possível' }),
      ...(school.focus ? {} : { focus: FOCUS }),
    }
    if (Object.keys(patch).length) nextTrip = { ...trip, expedition: { ...trip.expedition, school: { ...school, ...patch } }, updatedAt: now }
  }

  // 8 · trip workouts.
  const workouts: Workout[] = []
  let wOrder = 0
  for (const { slug, w } of WORKOUTS) {
    const id = m31Id(slug)
    if (removed.has(id) || db.workouts.some((x) => x.id === id)) continue
    // A session she already has that day for the same modality wins.
    if (db.workouts.some((x) => x.date === w.date && x.modality === w.modality)) continue
    workouts.push(clean({ status: 'planejado', order: wOrder++, tags: ['viagem'], ...w, id, createdAt: now, updatedAt: now }) as Workout)
  }

  // 2, 10, 14 · tasks.
  const tasks = new Map(db.tasks.map((t) => [t.id, t]))
  const newTasks: Task[] = []
  let tOrder = Math.max(0, ...db.tasks.map((t) => t.order)) + 1
  const taskTitles = () => new Set([...tasks.values(), ...newTasks].filter((t) => t.status !== 'archived').map((t) => normalize(t.title)))
  const createTask = (slug: string, t: NewTask) => {
    const id = m31Id(slug)
    if (tasks.has(id) || removed.has(id) || taskTitles().has(normalize(t.title))) return
    newTasks.push(clean({ status: 'todo', ...t, id, order: tOrder++, createdAt: now, updatedAt: now }) as Task)
  }
  /** Reuse her task: open → planned on that day (title/notes stay hers); done → nothing new. */
  const reuseTask = (reuse: string, t: NewTask): boolean => {
    const r = tasks.get(reuse)
    if (!r) return false
    if (r.status === 'done' || r.status === 'archived') return true
    const fill: Partial<Task> = {}
    const untouched = r.createdAt === r.updatedAt
    for (const k of ['date', 'dueDate', 'durationMin', 'tripId', 'priority'] as const) {
      if (t[k] === undefined || same(r[k], t[k])) continue
      if (r[k] === undefined || untouched) (fill as Record<string, unknown>)[k] = t[k]
    }
    if (Object.keys(fill).length) tasks.set(r.id, { ...r, ...fill, updatedAt: now })
    return true
  }
  for (const a of ALERTS) if (!(a.reuse && reuseTask(a.reuse, a.task))) createTask(a.slug, a.task)
  for (const f of FF_TASKS) {
    const t: NewTask = { status: 'todo', projectId: FF, context: 'trabalho', priority: 'media', tags: ['bloco-viagem'], notes: 'Bloco de trabalho em dia útil leve (depois da aula).', ...f.task }
    if (!(f.reuse && reuseTask(f.reuse, { title: t.title, date: t.date }))) createTask(f.slug, t)
  }

  return {
    ...db,
    profile,
    trips: db.trips.map((t) => (t.id === trip.id ? nextTrip : t)),
    tripItems: [...db.tripItems.map((i) => items.get(i.id) ?? i), ...added],
    workouts: [...db.workouts, ...workouts],
    tasks: [...db.tasks.map((t) => tasks.get(t.id) ?? t), ...newTasks],
  }
}
