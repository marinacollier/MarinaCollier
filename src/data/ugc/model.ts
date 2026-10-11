/**
 * UGC Business OS — the rules, pure (nothing written here).
 * Brand ≠ Opportunity. Statistics and the queue come from the records (interactions, dates), never typed.
 *
 * Cadence: first contact → follow-up at D+3, D+7, D+15 (from the cadence start, editable). A reply cancels
 * what was left. After the last follow-up with no answer → "sem resposta", tried again after 90 days.
 * Closed, lost, refused, paused or archived → never in a queue.
 */
import type { Brand, BrandTier, CreatorProfile, DateKey, DB, UgcChannel, UgcDealType, UgcInteraction, UgcOpportunity, UgcPrefs, UgcStage, UgcStatus } from '../types'
import { addDays, formatDayMonth, startOfWeek, weekday } from '@/lib/date'
import { normalize } from '@/lib/text'
import { LEVEL_LABEL, potential } from './score'

export const DEFAULT_UGC_PREFS: UgcPrefs = { dailyNew: 3, weeklyNew: 15, cadence: [3, 7, 15], reactivateDays: 90 }

/** Only what Marina stated (her message of 11/10). */
export const CREATOR_PROFILE: CreatorProfile = {
  name: 'Marina Collier',
  instagram: '@marinacollieramelo',
  portfolio: 'marinacollier-ugc.lovable.app',
  positioning: ['UGC Creator', 'Wellness', 'Running', 'Triathlon', 'Outdoor', 'Lifestyle', 'Tech'],
  contexts: ['corrida', 'triathlon', 'musculação', 'bike', 'yoga', 'natação', 'surf', 'trekking', 'viagens', 'tecnologia', 'IA', 'café', 'Luna (cachorro)', 'rotina real de treino', 'lifestyle ativo', 'viagens e experiências outdoor'],
}

export const STAGES: { id: UgcStage; label: string }[] = [
  { id: 'prospectar', label: 'Prospectar' },
  { id: 'contatada', label: 'Contatada' },
  { id: 'conversa', label: 'Conversa' },
  { id: 'producao', label: 'Produção' },
  { id: 'entregue', label: 'Entregue' },
  { id: 'fechada', label: 'Fechada' },
]
export const stageIndex = (s: UgcStage) => STAGES.findIndex((x) => x.id === s)
export const stageLabel = (s: UgcStage) => STAGES[stageIndex(s)]?.label ?? s

export const STATUS_LABEL: Record<UgcStatus, string> = {
  aberta: 'aberta',
  aguardando_resposta: 'aguardando resposta',
  negociando: 'negociando',
  pausada: 'pausada',
  sem_resposta: 'sem resposta',
  recusada: 'recusada',
  perdida: 'perdida',
  concluida: 'concluída',
}

export const CHANNEL_LABEL: Record<UgcChannel, string> = { dm: 'DM', email: 'E-mail', formulario: 'Formulário', linkedin: 'LinkedIn', whatsapp: 'WhatsApp' }
export const CHANNELS = Object.keys(CHANNEL_LABEL) as UgcChannel[]

export const TYPE_LABEL: Record<UgcDealType, string> = {
  ugc: 'UGC',
  permuta: 'Permuta',
  campanha_paga: 'Campanha remunerada',
  afiliado: 'Afiliado',
  embaixadora: 'Embaixadora',
  evento: 'Evento',
  press_kit: 'Press kit',
  programa_creators: 'Programa de creators',
}

export const TIERS: BrandTier[] = ['S', 'A', 'B', 'C']
const TIER_RANK: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 }

export const prefsOf = (db: DB): UgcPrefs => ({ ...DEFAULT_UGC_PREFS, ...(db.profile.ugc ?? {}) })

const CLOSED: UgcStatus[] = ['recusada', 'perdida', 'concluida', 'pausada']

export function brandOf(db: DB, o: Pick<UgcOpportunity, 'brandId'>): Brand | undefined {
  return db.brands.find((b) => b.id === o.brandId)
}

/** Still something to do with it (not closed, lost, refused, paused, nor its brand archived). */
export function isLive(db: DB, o: UgcOpportunity): boolean {
  return !CLOSED.includes(o.status) && !brandOf(db, o)?.archived
}

const key = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '')

/** "Ocean Drop" = "oceandrop" = "Ocean drop®"; "Galápagos" finds "Galápagos Outdoor". */
export function findBrand(db: DB, name: string): Brand | undefined {
  const k = key(name)
  if (!k) return undefined
  return db.brands.find((b) => key(b.name) === k) ?? (k.length >= 4 ? db.brands.find((b) => key(b.name).startsWith(k) || (key(b.name).length >= 4 && k.startsWith(key(b.name)))) : undefined)
}

/** The opportunity a sentence about a brand refers to: the live one, most advanced and most recent. */
export function currentOpportunity(db: DB, brandId: string): UgcOpportunity | undefined {
  const list = db.ugcOpportunities.filter((o) => o.brandId === brandId)
  const live = list.filter((o) => isLive(db, o))
  const pick = (l: UgcOpportunity[]) => [...l].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  return pick(live) ?? pick(list)
}

export const isWeekday = (d: DateKey) => weekday(d) >= 1 && weekday(d) <= 5

/** Next follow-up day after `step` follow-ups were sent; undefined when the cadence is over. */
export function followUpDay(prefs: UgcPrefs, from: DateKey, step: number): DateKey | undefined {
  const d = prefs.cadence[step]
  return d === undefined ? undefined : addDays(from, d)
}

// ─── Queues ─────────────────────────────────────────────────────────────────

const byTier = (db: DB) => (a: UgcOpportunity, b: UgcOpportunity) =>
  (TIER_RANK[brandOf(db, a)?.priorityTier ?? ''] ?? 9) - (TIER_RANK[brandOf(db, b)?.priorityTier ?? ''] ?? 9) || a.createdAt.localeCompare(b.createdAt)

/** Live deals waiting for a follow-up on `date` (overdue ones land on today). */
export function followUpsDue(db: DB, date: DateKey, today: DateKey): UgcOpportunity[] {
  return db.ugcOpportunities
    .filter((o) => isLive(db, o) && o.nextFollowUpAt && (o.nextFollowUpAt === date || (date === today && o.nextFollowUpAt < today)))
    .sort((a, b) => a.nextFollowUpAt!.localeCompare(b.nextFollowUpAt!) || byTier(db)(a, b))
}

/** The brand wrote last and she hasn't answered yet. */
export function toAnswer(db: DB): UgcOpportunity[] {
  return db.ugcOpportunities.filter((o) => {
    if (!isLive(db, o)) return false
    const last = db.ugcInteractions.filter((i) => i.opportunityId === o.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt)).at(-1)
    return last?.direction === 'in'
  })
}

/** Not approached yet — best tier first. */
/** Not contacted yet. Her tier leads; within the same tier, the potential (Entrega 3) decides. */
export function prospects(db: DB, today?: DateKey): UgcOpportunity[] {
  const list = db.ugcOpportunities.filter((o) => isLive(db, o) && o.stage === 'prospectar' && !o.firstContactAt)
  if (!today) return list.sort(byTier(db))
  const pts = new Map(list.map((o) => [o.id, brandOf(db, o) ? potential(db, brandOf(db, o)!, today).points : 0]))
  const tier = (o: UgcOpportunity) => TIER_RANK[brandOf(db, o)?.priorityTier ?? ''] ?? 9
  return list.sort((a, b) => tier(a) - tier(b) || pts.get(b.id)! - pts.get(a.id)! || a.createdAt.localeCompare(b.createdAt))
}

export function firstContactsOn(db: DB, from: DateKey, to: DateKey = from): number {
  return db.ugcInteractions.filter((i) => i.direction === 'out' && i.type === 'primeiro_contato' && i.date >= from && i.date <= to).length
}

/** The brands to approach today (weekdays only): the day's quota minus what she already did. */
export function approachToday(db: DB, today: DateKey): UgcOpportunity[] {
  if (!isWeekday(today)) return []
  const left = Math.max(0, prefsOf(db).dailyNew - firstContactsOn(db, today))
  return prospects(db, today).slice(0, left)
}

export interface UgcWeek {
  newApproaches: number
  target: number
  responses: number
  conversations: number
  closed: number
}

/** This week, from the records only. */
export function weekNumbers(db: DB, today: DateKey): UgcWeek {
  const from = startOfWeek(today)
  const to = addDays(from, 6)
  const inWeek = (d?: DateKey) => !!d && d >= from && d <= to
  return {
    newApproaches: firstContactsOn(db, from, to),
    target: prefsOf(db).weeklyNew,
    responses: db.ugcInteractions.filter((i) => i.direction === 'in' && inWeek(i.date)).length,
    conversations: db.ugcOpportunities.filter((o) => inWeek(o.negotiationStartedAt)).length,
    closed: db.ugcOpportunities.filter((o) => inWeek(o.agreedAt)).length,
  }
}

export function tierLabel(t?: BrandTier): string {
  return t ? `Tier ${t}` : 'sem tier'
}

// ─── The day's UGC actions (Home's one queue) ───────────────────────────────

export interface UgcAction {
  kind: 'approach' | 'followup' | 'answer'
  opportunity: UgcOpportunity
  brand?: Brand
  done: boolean
  /** The contact that did it (today), to untick. */
  interactionId?: string
  doneAt?: string
  /** Channel she'll most likely use. */
  channel: UgcChannel
  sub: string
}

function channelOf(db: DB, o: UgcOpportunity): UgcChannel {
  return o.primaryChannel ?? brandOf(db, o)?.contactChannels?.[0]?.channel ?? 'dm'
}

/** What UGC asks of her on `date`: approach (today, weekdays), follow-ups due, replies to answer. Done today stays, ticked. */
export function ugcDayActions(db: DB, date: DateKey, today: DateKey): UgcAction[] {
  const out: UgcAction[] = []
  const todayOut = date === today ? db.ugcInteractions.filter((i) => i.direction === 'out' && i.date === today) : []
  // Done today stays ticked — unless the brand was archived since (then it's out of every list).
  const doneBy = (o: UgcOpportunity, types: UgcInteraction['type'][]) => (brandOf(db, o)?.archived ? undefined : todayOut.filter((i) => i.opportunityId === o.id && types.includes(i.type)).at(-1))
  const label = (o: UgcOpportunity) => {
    const b = brandOf(db, o)
    return [b?.priorityTier ? `Tier ${b.priorityTier}` : undefined, b?.category, CHANNEL_LABEL[channelOf(db, o)]].filter(Boolean).join(' · ')
  }
  const seen = new Set<string>()
  const push = (a: UgcAction) => {
    if (seen.has(a.opportunity.id)) return
    seen.add(a.opportunity.id)
    out.push(a)
  }
  if (date === today) {
    for (const o of toAnswer(db)) push({ kind: 'answer', opportunity: o, brand: brandOf(db, o), done: false, channel: channelOf(db, o), sub: `respondeu ${o.lastContactAt ? formatDayMonth(o.lastContactAt) : ''}`.trim() })
    for (const o of db.ugcOpportunities) {
      const i = doneBy(o, ['mensagem', 'proposta'])
      if (i) push({ kind: 'answer', opportunity: o, brand: brandOf(db, o), done: true, interactionId: i.id, doneAt: i.sentAt, channel: i.channel, sub: CHANNEL_LABEL[i.channel] })
    }
  }
  for (const o of followUpsDue(db, date, today)) {
    const step = (o.followUpStep ?? 0) + 1
    push({ kind: 'followup', opportunity: o, brand: brandOf(db, o), done: false, channel: channelOf(db, o), sub: o.status === 'sem_resposta' ? 'reativar · sem resposta há tempo' : `follow-up ${step}${o.nextFollowUpAt! < date ? ' · era pra antes' : ''} · ${CHANNEL_LABEL[channelOf(db, o)]}` })
  }
  if (date === today) {
    for (const o of db.ugcOpportunities) {
      const i = doneBy(o, ['follow_up'])
      if (i) push({ kind: 'followup', opportunity: o, brand: brandOf(db, o), done: true, interactionId: i.id, doneAt: i.sentAt, channel: i.channel, sub: `follow-up · ${CHANNEL_LABEL[i.channel]}` })
    }
    for (const o of approachToday(db, today)) {
      const b = brandOf(db, o)
      const p = b ? potential(db, b, today) : undefined
      push({ kind: 'approach', opportunity: o, brand: b, done: false, channel: channelOf(db, o), sub: [label(o), p ? `${LEVEL_LABEL[p.level]}: ${p.reasons[0]}` : undefined].filter(Boolean).join(' · ') || 'nova marca' })
    }
    for (const o of db.ugcOpportunities) {
      const i = doneBy(o, ['primeiro_contato'])
      if (i) push({ kind: 'approach', opportunity: o, brand: brandOf(db, o), done: true, interactionId: i.id, doneAt: i.sentAt, channel: i.channel, sub: CHANNEL_LABEL[i.channel] })
    }
  }
  return out
}

export function actionTitle(a: Pick<UgcAction, 'kind' | 'brand' | 'opportunity'>): string {
  const name = a.brand?.name ?? a.opportunity.title
  return a.kind === 'approach' ? `Abordar ${name}` : a.kind === 'followup' ? `Follow-up ${name}` : `Responder ${name}`
}
