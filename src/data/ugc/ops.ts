/**
 * UGC Business OS — the writers. Every one goes through the store (same source of truth as the rest of
 * MARINA OS) and returns its undo. Home, the UGC space and Lumos all call these — never their own copy.
 */
import { actions, getDB } from '../store'
import { INCOME_CATEGORY_ID } from '../finance/receivables'
import type { Brand, BrandFact, CollectionKey, DateKey, ItemOf, UgcChannel, UgcInteraction, UgcMessage, UgcOpportunity, UgcStage } from '../types'
import { addDays, monthKey } from '@/lib/date'
import { nowISO } from '@/lib/id'
import type { MessageStrategy } from './strategy'
import { brandOf, currentOpportunity, findBrand, followUpDay, isLive, prefsOf, stageIndex } from './model'

export type Undo = () => void

function patch<K extends CollectionKey>(key: K, id: string, p: Partial<ItemOf<K>>): Undo {
  const before = (getDB()[key] as unknown as Record<string, unknown>[]).find((r) => r.id === id)
  if (!before) return () => {}
  const restore = Object.fromEntries(Object.keys(p).map((k) => [k, before[k]])) as Partial<ItemOf<K>>
  actions.update(key, id, p)
  return () => actions.update(key, id, restore)
}

function create<K extends CollectionKey>(key: K, data: Parameters<typeof actions.create<K>>[1]): { id: string; undo: Undo } {
  const item = actions.create(key, data) as { id: string }
  return { id: item.id, undo: () => void actions.remove(key, item.id) }
}

const all = (undos: Undo[]): Undo => () => [...undos].reverse().forEach((u) => u())

// ─── Brands & opportunities ─────────────────────────────────────────────────

/** A brand, once: an existing one with the same name is returned instead of a second card. */
export function addBrand(data: Partial<Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>> & { name: string }): { brand: Brand; created: boolean; undo: Undo } {
  const same = findBrand(getDB(), data.name)
  if (same) return { brand: same, created: false, undo: () => {} }
  const c = create('brands', { ...data, name: data.name.trim() })
  return { brand: getDB().brands.find((b) => b.id === c.id)!, created: true, undo: c.undo }
}

export function addOpportunity(brandId: string, data: Partial<Omit<UgcOpportunity, 'id' | 'createdAt' | 'updatedAt' | 'brandId'>> = {}): { opportunity: UgcOpportunity; undo: Undo } {
  const brand = getDB().brands.find((b) => b.id === brandId)
  const c = create('ugcOpportunities', { brandId, title: data.title ?? `${brand?.name ?? 'Marca'} · prospecção`, stage: 'prospectar', status: 'aberta', ...data })
  return { opportunity: getDB().ugcOpportunities.find((o) => o.id === c.id)!, undo: c.undo }
}

/** "adiciona Galápagos na minha lista de prospecção": the brand (once) + a live prospecting opportunity (once). */
export function ensureProspect(name: string, extra: Partial<Brand> = {}): { brand: Brand; opportunity: UgcOpportunity; createdBrand: boolean; createdOpportunity: boolean; undo: Undo } {
  const b = addBrand({ ...extra, name })
  const db = getDB()
  const live = db.ugcOpportunities.find((o) => o.brandId === b.brand.id && isLive(db, o))
  if (live) return { brand: b.brand, opportunity: live, createdBrand: b.created, createdOpportunity: false, undo: b.undo }
  if (b.brand.archived) patch('brands', b.brand.id, { archived: false })
  const o = addOpportunity(b.brand.id)
  return { brand: b.brand, opportunity: o.opportunity, createdBrand: b.created, createdOpportunity: true, undo: all([b.undo, o.undo]) }
}

// ─── Contacts (both ways) ───────────────────────────────────────────────────

export interface When {
  date: DateKey
  iso?: string
}

/**
 * She wrote to the brand (DM, e-mail, form, LinkedIn, WhatsApp). The first one opens the cadence
 * (D+3, D+7, D+15); each follow-up moves it on; after the last, "sem resposta" and a try again in 90 days.
 * After a reply, her message starts a fresh cadence (she now waits for them again).
 */
export function recordOutbound(opportunityId: string, channel: UgcChannel, at: When, content?: string, kind?: UgcInteraction['type']): { type: UgcInteraction['type']; undo: Undo } {
  const db = getDB()
  const o = db.ugcOpportunities.find((x) => x.id === opportunityId)
  if (!o) return { type: 'mensagem', undo: () => {} }
  const prefs = prefsOf(db)
  const first = !o.firstContactAt
  const afterReply = !!o.responseReceivedAt && stageIndex(o.stage) >= stageIndex('conversa')
  const type: UgcInteraction['type'] = kind ?? (first ? 'primeiro_contato' : afterReply ? 'mensagem' : 'follow_up')
  const p: Partial<UgcOpportunity> = { lastContactAt: at.date, primaryChannel: o.primaryChannel ?? channel }
  if (first || afterReply) {
    // a new wait starts here
    p.cadenceFrom = at.date
    p.followUpStep = 0
    p.nextFollowUpAt = stageIndex(o.stage) >= stageIndex('producao') ? undefined : followUpDay(prefs, at.date, 0)
    if (first) {
      p.firstContactAt = at.date
      if (stageIndex(o.stage) < stageIndex('contatada')) p.stage = 'contatada'
    }
    if (stageIndex(o.stage) < stageIndex('producao')) p.status = 'aguardando_resposta'
    if (type === 'proposta') p.proposalSentAt = at.date
  } else {
    const step = (o.followUpStep ?? 0) + 1
    const next = followUpDay(prefs, o.cadenceFrom ?? o.firstContactAt!, step)
    p.followUpStep = step
    p.nextFollowUpAt = next ?? addDays(at.date, prefs.reactivateDays)
    p.status = next ? 'aguardando_resposta' : 'sem_resposta'
  }
  const revert = Object.fromEntries(Object.keys(p).map((k) => [k, (o as unknown as Record<string, unknown>)[k] ?? null]))
  const i = create('ugcInteractions', { brandId: o.brandId, opportunityId: o.id, channel, direction: 'out', type, content, sentAt: at.iso ?? nowISO(), date: at.date, revert })
  return { type, undo: all([i.undo, patch('ugcOpportunities', o.id, p)]) }
}

/** Untick a contact (Home): the interaction goes away and the opportunity is exactly as before it. */
export function revertInteraction(interactionId: string): Undo {
  const i = getDB().ugcInteractions.find((x) => x.id === interactionId)
  if (!i?.opportunityId || !i.revert) return () => {}
  const back = Object.fromEntries(Object.entries(i.revert).map(([k, v]) => [k, v === null ? undefined : v])) as Partial<UgcOpportunity>
  const restoreOpp = patch('ugcOpportunities', i.opportunityId, back)
  const removed = actions.remove('ugcInteractions', i.id)
  return () => {
    if (removed) actions.restore('ugcInteractions', removed)
    restoreOpp()
  }
}

/** The brand answered: into Conversa, follow-ups left in the cadence are cancelled. */
export function recordReply(opportunityId: string, at: When, channel?: UgcChannel, content?: string): Undo {
  const o = getDB().ugcOpportunities.find((x) => x.id === opportunityId)
  if (!o) return () => {}
  const p: Partial<UgcOpportunity> = {
    responseReceivedAt: o.responseReceivedAt ?? at.date,
    negotiationStartedAt: o.negotiationStartedAt ?? at.date,
    nextFollowUpAt: undefined,
    followUpStep: 0,
    status: stageIndex(o.stage) >= stageIndex('producao') ? o.status : 'negociando',
    lastContactAt: at.date,
  }
  if (stageIndex(o.stage) < stageIndex('conversa')) p.stage = 'conversa'
  const i = create('ugcInteractions', { brandId: o.brandId, opportunityId: o.id, channel: channel ?? o.primaryChannel ?? 'dm', direction: 'in', type: 'resposta', content, sentAt: at.iso ?? nowISO(), date: at.date })
  return all([i.undo, patch('ugcOpportunities', o.id, p)])
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

/** Moves through the pipeline. From Produção on, nobody is chased any more. */
export function setStage(opportunityId: string, stage: UgcStage, today: DateKey): Undo {
  const o = getDB().ugcOpportunities.find((x) => x.id === opportunityId)
  if (!o || o.stage === stage) return () => {}
  const p: Partial<UgcOpportunity> = { stage }
  const at = stageIndex(stage)
  if (at >= stageIndex('conversa') && !o.negotiationStartedAt) p.negotiationStartedAt = today
  if (at >= stageIndex('producao')) {
    p.nextFollowUpAt = undefined
    p.agreedAt = o.agreedAt ?? today
    if (o.status === 'aguardando_resposta' || o.status === 'negociando' || o.status === 'sem_resposta') p.status = 'aberta'
  }
  if (stage === 'entregue') p.deliveredAt = o.deliveredAt ?? today
  if (stage === 'fechada') p.status = 'concluida'
  if (stage === 'prospectar' && !o.firstContactAt) p.status = 'aberta'
  return patch('ugcOpportunities', o.id, p)
}

/** Lost, refused or paused: out of every queue, follow-ups cancelled. */
export function endOpportunity(opportunityId: string, status: 'perdida' | 'recusada' | 'pausada', reason?: string): Undo {
  return patch('ugcOpportunities', opportunityId, { status, lostReason: reason, nextFollowUpAt: undefined })
}

/** "fechei com a marca X por R$ 800": Produção + the money expected in Dinheiro (one record, linked). */
export function closeDeal(opportunityId: string, today: DateKey, valueCents?: number): Undo {
  const db = getDB()
  const o = db.ugcOpportunities.find((x) => x.id === opportunityId)
  if (!o) return () => {}
  const undos = [setStage(o.id, 'producao', today), patch('ugcOpportunities', o.id, { agreedValueCents: valueCents ?? o.agreedValueCents, agreedAt: o.agreedAt ?? today })]
  const already = db.expenses.find((e) => e.ugcOpportunityId === o.id && e.type === 'income')
  if (valueCents && !already) {
    const brand = brandOf(db, o)
    undos.push(
      create('expenses', {
        type: 'income',
        title: `UGC · ${brand?.name ?? o.title}`,
        amountCents: valueCents,
        expectedAmountCents: valueCents,
        categoryId: INCOME_CATEGORY_ID,
        status: 'expected',
        period: monthKey(today),
        origin: 'manual',
        source: 'lumos',
        ugcOpportunityId: o.id,
      }).undo,
    )
  } else if (valueCents && already && already.status === 'expected') undos.push(patch('expenses', already.id, { amountCents: valueCents, expectedAmountCents: valueCents }))
  return all(undos)
}

/** Payment in: the expected income becomes received (same record) and the deal is done. */
export function markPaid(opportunityId: string, today: DateKey, amountCents?: number): Undo {
  const db = getDB()
  const o = db.ugcOpportunities.find((x) => x.id === opportunityId)
  if (!o) return () => {}
  const undos = [patch('ugcOpportunities', o.id, { paidAt: today, stage: 'fechada', status: 'concluida', nextFollowUpAt: undefined })]
  const income = db.expenses.find((e) => e.ugcOpportunityId === o.id && e.type === 'income')
  const amount = amountCents ?? income?.expectedAmountCents ?? o.agreedValueCents
  if (income) undos.push(patch('expenses', income.id, { status: 'received', receivedAt: nowISO(), receivedAmountCents: amount, date: today }))
  else if (amount) {
    undos.push(
      create('expenses', { type: 'income', title: `UGC · ${brandOf(db, o)?.name ?? o.title}`, amountCents: amount, receivedAmountCents: amount, categoryId: INCOME_CATEGORY_ID, status: 'received', receivedAt: nowISO(), date: today, period: monthKey(today), origin: 'manual', source: 'lumos', ugcOpportunityId: o.id }).undo,
    )
  }
  return all(undos)
}

/** What she said about her relationship with the brand — only that, nothing assumed. */
export function setRelationship(brandId: string, p: Pick<Partial<Brand>, 'alreadyCustomer' | 'alreadyUsedProduct' | 'relationshipStatus' | 'howDiscovered' | 'productsUsed'>): Undo {
  return patch('brands', brandId, p)
}

export function updateBrand(brandId: string, p: Partial<Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>>): Undo {
  return patch('brands', brandId, p)
}

/** "essa marca não faz mais sentido": archived, its live deals lost — history kept, out of every queue. */
export function archiveBrand(brandId: string, reason = 'não faz mais sentido'): Undo {
  const db = getDB()
  const undos = [patch('brands', brandId, { archived: true })]
  for (const o of db.ugcOpportunities.filter((x) => x.brandId === brandId && isLive(db, x))) undos.push(endOpportunity(o.id, 'perdida', reason))
  return all(undos)
}

/** The live opportunity of a brand, or a new one (a brand mentioned in a sentence always has somewhere to go). */
export function opportunityFor(brandId: string): { opportunity: UgcOpportunity; undo: Undo } {
  const db = getDB()
  const o = currentOpportunity(db, brandId)
  if (o && isLive(db, o)) return { opportunity: o, undo: () => {} }
  return addOpportunity(brandId)
}

export function setOpportunityType(opportunityId: string, type: UgcOpportunity['type']): Undo {
  return patch('ugcOpportunities', opportunityId, { type })
}

/** Back from lost / refused / paused / done: waiting again if she had written, else open. */
export function reopenOpportunity(opportunityId: string): Undo {
  const o = getDB().ugcOpportunities.find((x) => x.id === opportunityId)
  if (!o) return () => {}
  return patch('ugcOpportunities', o.id, { status: o.firstContactAt && !o.responseReceivedAt ? 'aguardando_resposta' : 'aberta', lostReason: undefined })
}

// ─── Brand facts & messages (Entrega 2) ─────────────────────────────────────

/** A true detail of the brand, with where it came from. What she types herself counts as verified. */
export function addBrandFact(brandId: string, fact: { text: string; source?: BrandFact['source']; sourceUrl?: string }): Undo {
  const b = getDB().brands.find((x) => x.id === brandId)
  const text = fact.text.trim()
  if (!b || !text) return () => {}
  const facts = b.personalizationFacts ?? []
  if (facts.some((f) => f.text.trim().toLowerCase() === text.toLowerCase())) return () => {}
  const source = fact.source ?? 'marina'
  const next: BrandFact = { text, source, sourceUrl: fact.sourceUrl?.trim() || undefined, capturedAt: nowISO(), verified: source === 'marina' || !!fact.sourceUrl }
  return patch('brands', brandId, { personalizationFacts: [...facts, next] })
}

export function removeBrandFact(brandId: string, index: number): Undo {
  const b = getDB().brands.find((x) => x.id === brandId)
  if (!b?.personalizationFacts?.[index]) return () => {}
  return patch('brands', brandId, { personalizationFacts: b.personalizationFacts.filter((_, i) => i !== index) })
}

/** "Gerar": the draft is kept (status rascunho) with the strategy that produced it — nothing is sent. */
export function saveDraft(s: MessageStrategy, text: string, opportunityId?: string, subject?: string): { message: UgcMessage; undo: Undo } {
  const strategy = [`Ângulo: ${s.angle}`, `Relação: ${s.relationship.say}`, subject ? `Assunto: ${subject}` : ''].filter(Boolean).join(' · ')
  const { id, undo } = create('ugcMessages', {
    brandId: s.brand.id,
    opportunityId,
    channel: s.channel,
    strategy,
    relevantContext: s.talk,
    avoidedContext: s.avoid,
    brandFactsUsed: s.fact ? [s.fact.text] : [],
    generatedText: text,
    status: 'rascunho',
  })
  return { message: getDB().ugcMessages.find((m) => m.id === id)!, undo }
}

/** She edited the text. */
export function editDraft(messageId: string, text: string): Undo {
  return patch('ugcMessages', messageId, { approvedText: text })
}

/** Copied = approved (the text she chose). */
export function approveMessage(messageId: string, text: string): Undo {
  const m = getDB().ugcMessages.find((x) => x.id === messageId)
  if (!m || m.status === 'enviada') return () => {}
  return patch('ugcMessages', messageId, { approvedText: text, status: 'aprovada' })
}

/**
 * "Mandei": SHE sent it. The message becomes enviada and the contact is logged on the opportunity
 * (same cadence as any other contact). The app never sends anything.
 */
export function markMessageSent(messageId: string, at: When): Undo {
  const m = getDB().ugcMessages.find((x) => x.id === messageId)
  if (!m || m.status === 'enviada') return () => {}
  const text = m.approvedText ?? m.generatedText ?? ''
  const opp = m.opportunityId ? { opportunity: getDB().ugcOpportunities.find((o) => o.id === m.opportunityId)!, undo: () => {} } : opportunityFor(m.brandId)
  const undos = [opp.undo]
  if (!m.opportunityId) undos.push(patch('ugcMessages', m.id, { opportunityId: opp.opportunity.id }))
  undos.push(patch('ugcMessages', m.id, { status: 'enviada', sentText: text, approvedText: text, sentAt: at.iso ?? nowISO() }))
  undos.push(recordOutbound(opp.opportunity.id, m.channel, at, text).undo)
  return all(undos)
}

export function discardMessage(messageId: string): Undo {
  const m = getDB().ugcMessages.find((x) => x.id === messageId)
  if (!m || m.status === 'enviada') return () => {}
  return patch('ugcMessages', messageId, { status: 'descartada' })
}
