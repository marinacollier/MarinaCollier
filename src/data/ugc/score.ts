/**
 * Score de oportunidade — how promising a brand is NOW, always with the reasons, never a made-up percentage.
 * Pure (reads only; nothing stored — computed on the spot so it can't go stale).
 *
 * - Until there are ~20 contacts with a known outcome (answered / no answer / refused), it is qualitative:
 *   alto · médio · baixo, from what she registered (tier, fit with her routine, relationship, a true brand
 *   detail, a channel/contact, past replies and deals).
 * - From 20 outcomes on, real counts join the reasons ("Outdoor: 3 de 5 responderam") — counts, not predictions.
 * - Her tier still leads the queue; the potential orders within it and explains it.
 */
import type { Brand, DateKey, DB } from '../types'
import { fitOf, tripContext } from './strategy'

export type PotentialLevel = 'alto' | 'medio' | 'baixo'

export interface Potential {
  level: PotentialLevel
  /** Internal ordering only — never shown. */
  points: number
  /** Why, strongest first. Always at least one. */
  reasons: string[]
  /** Points against (shown smaller). */
  against: string[]
  /** True once real numbers are part of the reasons. */
  fromData: boolean
}

export const LEVEL_LABEL: Record<PotentialLevel, string> = { alto: 'potencial alto', medio: 'potencial médio', baixo: 'potencial baixo' }
export const MIN_OUTCOMES = 20

const TIER_POINTS: Record<string, number> = { S: 4, A: 3, B: 2, C: 0.5 }
const ENDED = ['sem_resposta', 'recusada', 'perdida']

/** Contacts whose outcome is known: she wrote first and either they answered or it ended without an answer. */
export function outcomes(db: Pick<DB, 'ugcOpportunities'>): { brandId: string; answered: boolean; channel?: string }[] {
  return db.ugcOpportunities
    .filter((o) => o.firstContactAt && (o.responseReceivedAt || ENDED.includes(o.status)))
    .map((o) => ({ brandId: o.brandId, answered: !!o.responseReceivedAt, channel: o.primaryChannel }))
}

export function potential(db: DB, brand: Brand, today: DateKey): Potential {
  let points = 0
  const reasons: [number, string][] = []
  const against: string[] = []
  const add = (p: number, why: string) => {
    points += p
    reasons.push([p, why])
  }

  if (brand.priorityTier) add(TIER_POINTS[brand.priorityTier] ?? 0, `Tier ${brand.priorityTier} que você deu`)
  else points += 1

  const fit = fitOf(brand)
  const mine = new Set((db.profile.creator?.contexts ?? []).map((c) => c.toLowerCase()))
  const talk = fit?.talk.filter((t) => !mine.size || mine.has(t.toLowerCase())) ?? []
  if (fit && talk.length) add(2, `encaixa com sua rotina: ${talk.slice(0, 2).join(' e ')}`)
  else if (!brand.category) against.push('sem categoria — não sei se encaixa')
  else against.push('pouco encaixe com sua rotina')

  if (fit?.trip) {
    const trip = tripContext(db, today)
    if (trip) add(1, `a viagem ${trip} é um gancho real`)
  }

  if (brand.alreadyCustomer) add(2, 'você já é cliente')
  else if (brand.alreadyUsedProduct) add(1.5, 'você já usou')

  if ((brand.personalizationFacts ?? []).some((f) => f.verified && f.text.trim())) add(1, 'tem um detalhe real pra personalizar')
  if (brand.knownContacts?.length) add(1, `contato conhecido: ${brand.knownContacts[0].name}`)
  else if (brand.contactChannels?.length) add(0.5, 'canal de contato definido')

  const mineOpps = db.ugcOpportunities.filter((o) => o.brandId === brand.id)
  if (mineOpps.some((o) => o.paidAt || o.agreedAt)) add(2, 'já fechou com você antes')
  else if (mineOpps.some((o) => o.responseReceivedAt)) add(1.5, 'já respondeu você antes')
  if (mineOpps.some((o) => o.status === 'recusada')) {
    points -= 1.5
    against.push('já recusou uma vez')
  } else if (mineOpps.some((o) => o.status === 'sem_resposta' && !o.responseReceivedAt)) {
    points -= 1
    against.push('não respondeu da última vez')
  }

  // Real numbers only with enough history
  const done = outcomes(db)
  const fromData = done.length >= MIN_OUTCOMES
  if (fromData && brand.category) {
    const cat = brand.category.trim().toLowerCase()
    const same = done.filter((x) => db.brands.find((b) => b.id === x.brandId)?.category?.trim().toLowerCase() === cat)
    if (same.length >= 3) {
      const yes = same.filter((x) => x.answered).length
      const overall = done.filter((x) => x.answered).length / done.length
      const rate = yes / same.length
      const line = `${brand.category}: ${yes} de ${same.length} responderam`
      if (rate > overall) add(1, line)
      else {
        points -= 0.5
        against.push(line)
      }
    }
  }

  const level: PotentialLevel = points >= 6 ? 'alto' : points >= 3 ? 'medio' : 'baixo'
  const sorted = reasons.sort((a, b) => b[0] - a[0]).map(([, r]) => r)
  return { level, points, reasons: sorted.length ? sorted : ['ainda sem nada que indique — anote tier, categoria e relação'], against, fromData }
}

/** One line for a queue row: level + the top reason. */
export function potentialLine(p: Potential): string {
  return `${LEVEL_LABEL[p.level]} · ${p.reasons[0]}`
}
