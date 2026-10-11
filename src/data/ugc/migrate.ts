/**
 * One-time, idempotent: the Creator space's old "Parcerias" become Brand + Opportunity in the UGC Business
 * OS (one source of truth). Nothing is invented: no contact date, no relationship, no value that wasn't
 * there. The old record stays as history, pointing at its opportunity. Also puts in place the creator
 * profile she gave and the default prospecting rhythm (only when absent).
 */
import type { Brand, DB, PartnershipStage, UgcOpportunity, UgcStage, UgcStatus } from '../types'
import { formatDayMonth } from '@/lib/date'
import { nowISO, uid } from '@/lib/id'
import { normalize } from '@/lib/text'
import { CREATOR_PROFILE, DEFAULT_UGC_PREFS } from './model'

const MAP: Record<PartnershipStage, { stage: UgcStage; status: UgcStatus }> = {
  ideia: { stage: 'prospectar', status: 'aberta' },
  contato: { stage: 'contatada', status: 'aguardando_resposta' },
  negociacao: { stage: 'conversa', status: 'negociando' },
  fechado: { stage: 'producao', status: 'aberta' },
  producao: { stage: 'producao', status: 'aberta' },
  aguardando_aprovacao: { stage: 'producao', status: 'aberta' },
  publicado: { stage: 'entregue', status: 'aberta' },
  aguardando_pagamento: { stage: 'entregue', status: 'aberta' },
  finalizado: { stage: 'fechada', status: 'concluida' },
}

const key = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '')

export function migrateUgc(db: DB): DB {
  const pending = db.partnerships.filter((p) => !p.ugcOpportunityId && p.brand?.trim())
  const needsProfile = !db.profile.creator || !db.profile.ugc
  if (!pending.length && !needsProfile) return db
  const now = nowISO()
  const brands: Brand[] = [...db.brands]
  const opps: UgcOpportunity[] = [...db.ugcOpportunities]
  const partnerships = db.partnerships.map((p) => {
    if (p.ugcOpportunityId || !p.brand?.trim()) return p
    let brand = brands.find((b) => key(b.name) === key(p.brand))
    if (!brand) {
      brand = { id: uid(), createdAt: now, updatedAt: now, name: p.brand.trim() }
      brands.push(brand)
    }
    const m = MAP[p.stage] ?? MAP.ideia
    const notes = [p.notes, p.deadline ? `Prazo: ${formatDayMonth(p.deadline)}` : undefined, p.coupon ? `Cupom: ${p.coupon}` : undefined, p.affiliateLink ? `Link: ${p.affiliateLink}` : undefined, p.barter ? `Permuta: ${p.barter}` : undefined, p.contact ? `Contato: ${p.contact}` : undefined]
      .filter(Boolean)
      .join('\n')
    const o: UgcOpportunity = {
      id: uid(),
      createdAt: p.createdAt ?? now,
      updatedAt: now,
      brandId: brand.id,
      title: p.format ? `${brand.name} · ${p.format}` : `${brand.name} · parceria`,
      stage: m.stage,
      status: m.status,
      objective: p.briefing,
      proposedDeliverables: p.deliverables,
      agreedValueCents: p.valueCents,
      compensationType: p.barter && !p.valueCents ? 'permuta' : undefined,
      notes: notes || undefined,
    }
    opps.push(o)
    return { ...p, ugcOpportunityId: o.id, updatedAt: now }
  })
  return {
    ...db,
    brands,
    ugcOpportunities: opps,
    partnerships,
    profile: { ...db.profile, creator: db.profile.creator ?? CREATOR_PROFILE, ugc: db.profile.ugc ?? DEFAULT_UGC_PREFS },
  }
}
