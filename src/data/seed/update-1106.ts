/**
 * ATUALIZAÇÃO OPERACIONAL 06/11 — Marina's last week in Cape Town (06–16/11/2026), applied ONCE to her data on
 * top of the Expedição and the Atualização mestre 31/10. Her rules for this one:
 *
 * - it runs once per install (`profile.tripUpdatesApplied` gets UPDATE_1106_ID) and only from 06/11 on; boot
 *   keeps an automatic copy of the data right before it (see store.ts `hydrate`);
 * - existing records are updated, never duplicated (ids, history, payments and ticked checklists stay). What
 *   she gave in this update wins over older plan values, EXCEPT: done/cancelled is never reopened, and a
 *   RESERVADO item (with proof) is never moved or downgraded — a clash with it is left visible as a conflict;
 * - notes she wrote are kept: the 06/11 line is appended to them;
 * - status vocabulary: RESERVADO only with proof; AGUARDANDO RESPOSTA (operator owes an answer), AGUARDANDO
 *   PAGAMENTO (her payment/forms are missing), A RESERVAR, PLANEJADO, OPCIONAL. A paid Dineplan fee is not a
 *   confirmed table; a good sea forecast is not a booking;
 * - money in ZAR only, exactly the values she gave (quoted vs estimated vs paid kept apart); no conversion;
 * - plans that are no longer in her week (Garden Route 07–09/11, Kirstenbosch) become OPCIONAL without a date,
 *   with the reason — nothing is deleted or cancelled in her name;
 * - new records use stable ids (`seed:za1106:*`), are never created after she deleted them
 *   (`profile.removedSeedIds`) and never next to an open one of hers with the same title.
 *
 * Returns the SAME db object when there is nothing to do.
 */
import type { DateKey, DB, Task, TripItem } from '../types'
import { TRANQUILO_SP_ID } from './backlog'
import { zaId } from './expedition'
import { m31Id } from './master-1031'
import { SEED_IDS } from './ids'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'

export const UPDATE_1106_ID = 'za-2026-11-06'
export const UPDATE_1106_FROM: DateKey = '2026-11-06'
const TRIP = SEED_IDS.tripAfrica
const FF = SEED_IDS.projFashionFinder
export const u06Id = (slug: string) => `seed:za1106:${slug}`
const oldId = (slug: string) => `seed:travel:${TRIP}-${slug}`
const D = (day: number): DateKey => `2026-11-${String(day).padStart(2, '0')}`
const CT = 'Cape Town'
const NOTE = (s: string) => `06/11: ${s}`

type ItemPatch = Partial<Omit<TripItem, 'id' | 'tripId' | 'createdAt' | 'updatedAt'>>
type NewTripItem = ItemPatch & Pick<TripItem, 'section' | 'title' | 'status'>
type NewTask = Pick<Task, 'title'> & Partial<Task>

/** Out of the last week: optional, no date, with the reason (her done/cancelled/booked items are left alone). */
const OUT = (why: string): ItemPatch => ({ optional: true, bookingStatus: 'opcional', status: 'a_confirmar', date: undefined, endDate: undefined, time: undefined, endTime: undefined, schoolImpact: undefined, caveat: why })

// ─── Itinerary: existing records rebuilt (reuse) or created when the record is gone/closed ──

const ITINERARY: { reuse?: string; slug: string; patch: NewTripItem }[] = [
  // Sexta 06/11
  {
    slug: 'mama-africa',
    patch: {
      section: 'comida',
      group: CT,
      title: 'Jantar Mama Africa',
      status: 'a_confirmar',
      date: D(6),
      bookingStatus: 'aguardando_resposta',
      supplier: 'Mama Africa · reserva via Dineplan',
      currency: 'ZAR',
      paidCents: 11000,
      category: 'alimentacao',
      priority: 'P1',
      nextAction: 'Conferir o e-mail de confirmação e o horário exato da reserva',
      caveat: 'Pagamento Dineplan de R110 aprovado; a confirmação completa da reserva ainda deve ser conferida',
      notes: NOTE('Reserva encaminhada via Dineplan; pagamento de R110 aprovado.'),
    },
  },
  {
    slug: 'access-park',
    patch: {
      section: 'roteiro',
      group: CT,
      title: 'Outlet Access Park · Kenilworth',
      status: 'a_fazer',
      date: D(6),
      endTime: '17:30',
      bookingStatus: 'planejado',
      category: 'compras',
      priority: 'P2',
      notes: NOTE('Até 17h30. Lista de compras em Expedição → Compras (Access Park). Não comprar: dry bag, prancha de surf, café sul-africano, bolsas de couro adicionais.'),
    },
  },
  {
    slug: 'waterfront-compras',
    patch: {
      section: 'roteiro',
      group: CT,
      title: 'Compras no Waterfront',
      status: 'a_fazer',
      date: D(6),
      bookingStatus: 'planejado',
      category: 'compras',
      priority: 'P2',
      notes: NOTE('Cosméticos (Clicks), eletrônicos, Racefood, cookies e presentes. Não comprar: dry bag, prancha de surf, café sul-africano, bolsas de couro adicionais.'),
    },
  },
  // Sábado 07/11
  {
    reuse: zaId('kalk-bay'),
    slug: 'kalk-bay',
    patch: {
      section: 'quero_ir',
      group: CT,
      title: 'Kalk Bay',
      status: 'a_fazer',
      date: D(7),
      leaveTime: '08:30',
      time: '09:30',
      endTime: '13:00',
      bookingStatus: 'planejado',
      category: 'tours',
      priority: 'P1',
      notes: NOTE('08h30 saída · 09h30 cafés, lojas, galerias e porto · 12h almoço.'),
    },
  },
  { slug: 'st-james', patch: { section: 'quero_ir', group: CT, title: 'St James Beach', status: 'a_fazer', date: D(7), time: '13:00', endTime: '14:00', bookingStatus: 'planejado', category: 'tours', priority: 'P2', notes: NOTE('Depois do almoço em Kalk Bay; às 14h, deslocamento para Constantia.') } },
  {
    slug: 'beau-constantia',
    patch: {
      section: 'reserva',
      group: CT,
      title: 'Beau Constantia — degustação',
      status: 'a_confirmar',
      date: D(7),
      leaveTime: '14:00',
      time: '15:00',
      endTime: '16:30',
      bookingStatus: 'a_reservar',
      currency: 'ZAR',
      estimatedCents: 15000,
      route: 'Retorno de Uber',
      category: 'tours',
      priority: 'P1',
      nextAction: 'Fazer a reserva para sábado às 15h',
      caveat: 'Degustação R110–150 (estimativa); acontece só se conseguir reserva',
    },
  },
  // Domingo 08/11
  {
    reuse: zaId('stellenbosch-gravel'),
    slug: 'cape-velo',
    patch: {
      section: 'esporte',
      group: CT,
      title: 'Cape Velo — gravel privado em Paarl/Stellenbosch',
      status: 'a_confirmar',
      date: D(8),
      bookingStatus: 'aguardando_pagamento',
      supplier: 'Cape Velo',
      currency: 'ZAR',
      quotedCents: 400000,
      category: 'treinos',
      priority: 'P0',
      deadline: D(7),
      nextAction: 'Pagar, assinar os formulários e pedir percurso adaptável ao condicionamento',
      caveat: 'Distância, altimetria e transporte desde Cape Town ainda a verificar',
      checklistKind: 'bike',
      notes: NOTE('Passeio privado, R4.000 cotado. Inclui bicicleta, equipamentos, guia e alimentação conforme a proposta.'),
    },
  },
  // Segunda 09/11
  {
    reuse: zaId('caiaque'),
    slug: 'caiaque',
    patch: {
      section: 'reserva',
      group: CT,
      title: 'Caiaque com focas — Hout Bay (Kayak Adventures)',
      status: 'a_confirmar',
      optional: false,
      date: D(9),
      time: '13:00',
      endTime: '15:00',
      schoolImpact: 'parcial',
      certainty: 'pendente',
      bookingStatus: 'aguardando_resposta',
      supplier: 'Kayak Adventures',
      currency: 'ZAR',
      category: 'tours',
      priority: 'P1',
      nextAction: 'Aguardar a confirmação do grupo mínimo',
      caveat: 'Operador exige mínimo de 4 participantes; grupo ainda não confirmado. Preço a confirmar',
      planB: 'Quinta 12/11 às 15h — alternativa ainda não garantida (choca com Robben Island)',
      notes: NOTE('Escola de manhã, saída antecipada para Hout Bay.'),
    },
  },
  // Terça 10/11
  {
    reuse: zaId('gansbaai-hermanus'),
    slug: 'gansbaai',
    patch: {
      section: 'reserva',
      group: CT,
      title: 'Hookah Shark Diving + Whale Watching — Gansbaai',
      status: 'a_confirmar',
      optional: false,
      date: D(10),
      schoolImpact: 'dia',
      certainty: 'clima',
      bookingStatus: 'aguardando_resposta',
      supplier: 'White Shark Diving · Amanda · chamado #WHI-114',
      currency: 'ZAR',
      quotedCents: 600000,
      paymentStatus: 'pendente',
      category: 'tours',
      priority: 'P0',
      nextAction: 'Aguardar a Amanda confirmar vagas e transporte',
      caveat: 'Previsão marítima favorável não é reserva confirmada',
      notes: NOTE('Dia inteiro. Pacote R5.050 + transfer compartilhado R950 = R6.000, pagamento por cartão na chegada.'),
    },
  },
  // Quarta 11/11
  {
    reuse: zaId('snorkel-focas'),
    slug: 'ocean-safari',
    patch: {
      section: 'reserva',
      group: CT,
      title: 'Ocean Safari with Snorkeling — Animal Ocean (Hout Bay)',
      status: 'a_confirmar',
      optional: false,
      date: D(11),
      time: '09:00',
      certainty: 'clima',
      bookingStatus: 'a_reservar',
      supplier: 'Animal Ocean',
      currency: 'ZAR',
      quotedCents: 295000,
      category: 'tours',
      priority: 'P0',
      nextAction: 'Concluir o checkout para quarta às 9h — sem a GoPro de R700',
      caveat: 'Snorkel em floresta de kelp; contato próximo ou mergulho com focas não é garantido',
    },
  },
  // Quinta 12/11
  {
    reuse: zaId('robben-island'),
    slug: 'robben-island',
    patch: {
      section: 'reserva',
      group: CT,
      title: 'Robben Island — Standard Tour',
      status: 'a_confirmar',
      optional: false,
      date: D(12),
      time: '15:00',
      prepTime: '14:30',
      address: 'Nelson Mandela Gateway, V&A Waterfront',
      bookingStatus: 'a_reservar',
      currency: 'ZAR',
      estimatedCents: 60000,
      category: 'tours',
      priority: 'P1',
      nextAction: 'Comprar o ingresso para quinta às 15h, se houver disponibilidade',
      caveat: 'Ingresso internacional anunciado R600; disponibilidade não confirmada. Passeio de ~3h30–4h',
      notes: NOTE('Check-in até 14h30 no Nelson Mandela Gateway.'),
    },
  },
  {
    reuse: zaId('malas'),
    slug: 'malas',
    patch: { section: 'mala', group: CT, title: 'Arrumar malas e documentos de Joanesburgo', status: 'a_fazer', date: D(12), bookingStatus: 'planejado', priority: 'P1' },
  },
  // Decision she has not made yet.
  {
    slug: 'wine-tram',
    patch: {
      section: 'quero_ir',
      group: CT,
      title: 'Franschhoek Wine Tram',
      status: 'a_confirmar',
      optional: true,
      bookingStatus: 'opcional',
      category: 'tours',
      priority: 'P2',
      caveat: 'Decisão pendente — não reservar automaticamente. Sem data e sem cotação final',
      notes: NOTE(
        'Interesse alto. Não cabe sem substituir uma experiência (deslocamento até Franschhoek + várias horas). Alternativas: (1) sábado inteiro, no lugar de Kalk Bay e Constantia; (2) quinta, no lugar de Robben Island; (3) próxima viagem.',
      ),
    },
  },
]

/** Kwa Maritane / safari: only the next step she gave. */
const SAFARI_NEXT: { id: string; patch: ItemPatch }[] = [
  { id: oldId('safari'), patch: { nextAction: 'Verificar inclusões, pagamento e transfers do Kwa Maritane' } },
  { id: oldId('transfers'), patch: { nextAction: 'Confirmar transfers com a hospedagem/agência' } },
]

/** No longer in her last week. */
const OUT_OF_WEEK: { id: string; why: string }[] = [
  { id: zaId('garden-route-1'), why: 'Fora do roteiro de 06/11 (07–09/11 agora: Kalk Bay/Constantia, Cape Velo, caiaque)' },
  { id: zaId('garden-route-hosp'), why: 'Fora do roteiro de 06/11' },
  { id: zaId('tsitsikamma'), why: 'Fora do roteiro de 06/11' },
  { id: zaId('garden-route-volta'), why: 'Fora do roteiro de 06/11' },
  { id: zaId('bloukrans'), why: 'Fora do roteiro de 06/11' },
  { id: m31Id('prep-garden-route'), why: 'Fora do roteiro de 06/11 (sem Garden Route)' },
  { id: zaId('kirstenbosch'), why: 'Fora do roteiro de 06/11 (10/11 é Gansbaai)' },
]

// ─── Shopping (06/11) — reuses the 31/10 list for the same thing ────────────

const SHOP: { slug: string; title: string; group: string; person?: string; category?: TripItem['category']; notes?: string; reuse?: string }[] = [
  ...(['Shorts e leggings esportivos', 'Tops e camisetas', 'Roupas de surf', 'Tênis — só com desconto relevante', 'Peças de trilha'] as const).map((t, i) => ({ slug: `ap-${i + 1}`, title: t, group: 'Compras · Access Park', notes: 'Verificar.' })),
  { slug: 'microsd', title: 'MicroSD 128 GB U3/V30', group: 'Compras · Eletrônicos', notes: 'Só se for compatível com a câmera.' },
  { slug: 'leitor-cartao', title: 'Leitor de cartão', group: 'Compras · Eletrônicos', notes: 'Conferir.' },
  { slug: 'protecao-estanque', title: 'Proteção estanque para uso no mar', group: 'Compras · Eletrônicos', notes: 'Conferir. (Dry bag não.)' },
  ...(
    [
      ['Essence stick foundation cor 160', undefined],
      ['Essence lip oil', undefined],
      ['Máscara de cílios que não borre', undefined],
      ['Gel de sobrancelha Essence transparente', 'Se quiser reserva.'],
      ['In Cashmere — perfume ou body splash', undefined],
      ['African Extracts Rooibos', undefined],
      ['Oh So Heavenly', undefined],
    ] as const
  ).map(([t, n], i) => ({ slug: `clicks-${i + 1}`, title: t, group: 'Compras · Clicks', notes: n })),
  ...(
    [
      ['Cookies sul-africanos', undefined],
      ['Racefood / FARBAR', undefined],
      ['Chocolates locais', undefined],
      ['Rooibos tea', undefined],
      ['Molho peri-peri ou chakalaka', undefined],
      ['Biltong', 'Para consumir localmente (não levar na mala).'],
    ] as const
  ).map(([t, n], i) => ({ slug: `mercado-${i + 1}`, title: t, group: 'Compras · Supermercado', notes: n })),
  { slug: 'canga', reuse: m31Id('canga'), title: 'Canga para Marina', group: 'Compras · Presentes', person: 'Marina', category: 'compras', notes: 'Para uso próprio.' },
  { slug: 'vinho-matheus', reuse: m31Id('vinho-matheus'), title: 'Vinho sul-africano para Matheus', group: 'Compras · Presentes', person: 'Matheus', category: 'presentes' },
  { slug: 'whisky-lucas', reuse: m31Id('whisky-luquinhas'), title: 'Whisky para Lucas', group: 'Compras · Presentes', person: 'Lucas', category: 'presentes' },
  { slug: 'lembranca-artesanal', reuse: m31Id('lembrancas'), title: 'Lembrança artesanal', group: 'Compras · Presentes', category: 'presentes', notes: 'Se encontrar.' },
]

// ─── Tasks ──────────────────────────────────────────────────────────────────

const work = (t: NewTask): NewTask => ({ context: 'trabalho', ...t })
/** Done today, in her words (recorded as done — nothing she only started). */
const DONE_TODAY: { slug: string; task: NewTask }[] = [
  { slug: 'feito-tranquilo-reuniao', task: work({ title: 'Reunião da manhã — Tranquilo', projectId: TRANQUILO_SP_ID }) },
  { slug: 'feito-ff-atividades', task: work({ title: 'Atividades de Fashion Finder do dia', projectId: FF, notes: 'Registro do que ela disse ter executado em 06/11 (sem detalhar quais).' }) },
  { slug: 'feito-tranquilo-atividades', task: work({ title: 'Atividades de Tranquilo do dia', projectId: TRANQUILO_SP_ID, notes: 'Registro do que ela disse ter executado em 06/11 (sem detalhar quais).' }) },
  { slug: 'feito-bernoulli', task: { title: 'Teste de fit cultural — Grupo Bernoulli', context: 'carreira' } },
  { slug: 'feito-mama-africa', task: { title: 'Encaminhar reserva do Mama Africa via Dineplan (R110 pagos)', context: 'viagem', tripId: TRIP } },
  { slug: 'feito-contato-wsd', task: { title: 'Contatar White Shark Diving para reagendamento', context: 'viagem', tripId: TRIP } },
  { slug: 'feito-contato-kayak', task: { title: 'Contatar Kayak Adventures sobre disponibilidade', context: 'viagem', tripId: TRIP } },
]
/** Today's open work. */
const TODAY: { slug: string; task: NewTask; reuse?: RegExp }[] = [
  { slug: 'tranquilo-ajustes', task: work({ title: 'Desenvolver ajustes técnicos pendentes do Tranquilo', projectId: TRANQUILO_SP_ID, priority: 'alta' }) },
  { slug: 'ff-apple', reuse: /\bapple\b/, task: work({ title: 'Resolver configuração Apple — Fashion Finder', projectId: FF, priority: 'alta' }) },
  { slug: 'ingles-teste', task: { title: 'Fazer teste de inglês', context: 'estudo', priority: 'alta' } },
  { slug: 'ingles-apresentacao', task: { title: 'Preparar apresentação de inglês', context: 'estudo', priority: 'alta' } },
  { slug: 'ff-reuniao-18h', task: work({ title: 'Reunião Fashion Finder', projectId: FF, time: '18:00', priority: 'alta', notes: '18h no horário de Cape Town.' }) },
  { slug: 'cape-velo-email', task: { title: 'Conferir e-mail do Cape Velo, pagamento e formulários', context: 'viagem', tripId: TRIP, priority: 'alta', dueDate: D(7), notes: 'O passeio é domingo 08/11: pagamento e formulários antes.' } },
  { slug: 'reservas-ocean-robben', task: { title: 'Avançar nas reservas de Ocean Safari e Robben Island', context: 'viagem', tripId: TRIP, priority: 'alta' } },
]
/** Answers owed by operators (Waiting For). */
const WAITING: { slug: string; who: string; title: string; notes?: string }[] = [
  { slug: 'espera-wsd', who: 'White Shark Diving (Amanda)', title: 'Vagas e transporte para terça 10/11', notes: 'Chamado #WHI-114. Não marcar como confirmado até a resposta definitiva.' },
  { slug: 'espera-kayak', who: 'Kayak Adventures', title: 'Grupo mínimo (4) para segunda 09/11 às 13h' },
  { slug: 'espera-mama-africa', who: 'Mama Africa / Dineplan', title: 'E-mail de confirmação e horário exato do jantar' },
]
/** 31/10 tasks this update closes or makes moot (only while open and never edited by her). */
const CLOSE: { id: string; how: 'done' | 'archived'; why: string }[] = [
  { id: m31Id('alerta-cape-velo'), how: 'done', why: 'Informações do Cape Velo recebidas em 06/11.' },
  { id: m31Id('alerta-garden-route'), how: 'archived', why: 'Garden Route fora do roteiro de 06/11.' },
  { id: m31Id('alerta-bungee-medico'), how: 'archived', why: 'Bungee fora do roteiro de 06/11 (Garden Route).' },
]
/** 31/10 school alert, rewritten for the early leave on 09/11 (only while open and never edited). */
const SCHOOL_09 = { id: m31Id('alerta-escola-09'), title: 'Avisar a escola: saída antecipada na segunda 09/11 (caiaque)', date: D(6), dueDate: D(8) }

// ─── Apply ──────────────────────────────────────────────────────────────────

const edited = (r: { createdAt: string; updatedAt: string }) => r.createdAt !== r.updatedAt
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const closed = (r: TripItem) => r.status === 'feito' || r.status === 'cancelado'
/** Booked with proof: never moved or downgraded by this update. */
const booked = (r: TripItem) => r.bookingStatus === 'reservado' && !!(r.voucherUrl?.trim() || r.confirmationCode?.trim() || r.proof?.trim())
const LOCKED_WHEN_BOOKED = new Set<keyof TripItem>(['date', 'endDate', 'time', 'endTime', 'status', 'booking', 'bookingStatus', 'optional', 'certainty'])
const PAID = new Set<keyof TripItem>(['paidCents'])

const clean = <T extends object>(o: T): T => {
  const out = { ...o }
  for (const k of Object.keys(out) as (keyof T)[]) if (out[k] === undefined) delete out[k]
  return out
}

/** Her 06/11 values over the record, within the rules above. */
function patchItem(r: TripItem, patch: ItemPatch, now: string): TripItem {
  let out: TripItem | undefined
  const isBooked = booked(r)
  for (const [k, v] of Object.entries(patch) as [keyof TripItem, unknown][]) {
    if (isBooked && LOCKED_WHEN_BOOKED.has(k)) continue
    // A payment already recorded is hers (never overwritten by a reference value).
    if (PAID.has(k) && r[k] != null) continue
    let next = v
    if (k === 'notes' && typeof v === 'string' && r.notes?.trim()) {
      if (r.notes.includes(v)) continue
      next = `${r.notes}\n${v}`
    }
    if (same(r[k], next)) continue
    out ??= { ...r }
    if (next === undefined) delete (out as unknown as Record<string, unknown>)[k]
    else (out as unknown as Record<string, unknown>)[k] = next
  }
  return out ? { ...out, updatedAt: now } : r
}

export function needsUpdate1106(db: DB, today: DateKey): boolean {
  return today >= UPDATE_1106_FROM && !db.profile.tripUpdatesApplied?.includes(UPDATE_1106_ID) && db.trips.some((t) => t.id === TRIP)
}

export function applyUpdate1106(db: DB, today: DateKey, now: string = nowISO()): DB {
  if (today < UPDATE_1106_FROM || db.profile.tripUpdatesApplied?.includes(UPDATE_1106_ID)) return db
  const profile = { ...db.profile, tripUpdatesApplied: [...(db.profile.tripUpdatesApplied ?? []), UPDATE_1106_ID] }
  if (!db.trips.some((t) => t.id === TRIP)) return { ...db, profile }

  const removed = new Set(db.profile.removedSeedIds ?? [])
  const items = new Map(db.tripItems.map((i) => [i.id, i]))
  const added: TripItem[] = []
  const openTitles = () => new Set([...items.values(), ...added].filter((i) => i.tripId === TRIP && !closed(i)).map((i) => normalize(i.title)))
  let order = Math.max(4000, ...db.tripItems.filter((i) => i.tripId === TRIP).map((i) => i.order)) + 1
  const create = (slug: string, x: NewTripItem) => {
    const id = u06Id(slug)
    if (items.has(id) || removed.has(id) || added.some((a) => a.id === id) || openTitles().has(normalize(x.title))) return
    added.push(clean({ ...x, id, tripId: TRIP, order: order++, createdAt: now, updatedAt: now }) as TripItem)
  }

  // Itinerary: the existing record when it is still open; otherwise a new one (her closed record stays as is).
  for (const x of ITINERARY) {
    const r = x.reuse ? items.get(x.reuse) : items.get(u06Id(x.slug))
    if (r && !closed(r)) items.set(r.id, patchItem(r, x.patch, now))
    else create(x.slug, x.patch)
  }
  for (const s of SAFARI_NEXT) {
    const r = items.get(s.id)
    if (r && !closed(r)) items.set(r.id, patchItem(r, s.patch, now))
  }
  for (const o of OUT_OF_WEEK) {
    const r = items.get(o.id)
    // Hers to decide when she closed it, booked it, or changed it herself.
    if (r && !closed(r) && !booked(r) && !edited(r)) items.set(r.id, patchItem(r, OUT(o.why), now))
  }
  for (const s of SHOP) {
    const r = s.reuse ? items.get(s.reuse) : undefined
    const base: NewTripItem = { section: 'comprar', group: s.group, title: s.title, status: 'a_fazer', bookingStatus: 'planejado', person: s.person ?? 'Marina', category: s.category ?? 'compras', priority: 'P2', deadline: D(12), notes: s.notes }
    if (r && !closed(r)) items.set(r.id, patchItem(r, clean({ group: s.group, person: s.person, notes: s.notes ? NOTE(s.notes) : undefined }), now))
    else if (!r) create(s.slug, base)
  }

  // Tasks.
  const tasks = new Map(db.tasks.map((t) => [t.id, t]))
  const newTasks: Task[] = []
  let tOrder = Math.max(0, ...db.tasks.map((t) => t.order)) + 1
  const openTaskTitles = () => new Set([...tasks.values(), ...newTasks].filter((t) => t.status !== 'archived').map((t) => normalize(t.title)))
  const createTask = (slug: string, t: NewTask) => {
    const id = u06Id(slug)
    if (tasks.has(id) || removed.has(id) || openTaskTitles().has(normalize(t.title))) return
    newTasks.push(clean({ status: 'todo', ...t, id, order: tOrder++, createdAt: now, updatedAt: now }) as Task)
  }
  for (const d of DONE_TODAY) createTask(d.slug, { ...d.task, status: 'done', date: D(6), completedAt: now, tags: ['06/11'] })
  for (const t of TODAY) {
    const mine = t.reuse ? [...tasks.values()].find((x) => (x.status === 'todo' || x.status === 'doing') && t.reuse!.test(normalize(x.title))) : undefined
    if (mine) {
      // Her open task: planned for today (title and notes stay hers).
      if (mine.date !== D(6)) tasks.set(mine.id, { ...mine, date: D(6), priority: mine.priority ?? t.task.priority, updatedAt: now })
    } else createTask(t.slug, { date: D(6), ...t.task })
  }
  for (const w of WAITING) createTask(w.slug, { title: w.title, status: 'waiting', waiting: { who: w.who, since: D(6) }, context: 'viagem', tripId: TRIP, notes: w.notes, tags: ['operador'] })
  for (const c of CLOSE) {
    const r = tasks.get(c.id)
    if (!r || edited(r) || r.status === 'done' || r.status === 'archived') continue
    tasks.set(r.id, { ...r, status: c.how, ...(c.how === 'done' ? { completedAt: now } : {}), notes: [r.notes, NOTE(c.why)].filter(Boolean).join('\n'), updatedAt: now })
  }
  const school = tasks.get(SCHOOL_09.id)
  if (school && !edited(school) && school.status !== 'done' && school.status !== 'archived') tasks.set(school.id, { ...school, title: SCHOOL_09.title, date: SCHOOL_09.date, dueDate: SCHOOL_09.dueDate, updatedAt: now })

  return {
    ...db,
    profile,
    tripItems: [...db.tripItems.map((i) => items.get(i.id) ?? i), ...added],
    tasks: [...db.tasks.map((t) => tasks.get(t.id) ?? t), ...newTasks],
  }
}
