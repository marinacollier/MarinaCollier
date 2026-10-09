/**
 * Opportunities, professional contacts and executive evidence. Pure selectors + undoable store wrappers.
 * Nothing here invents a company, a person or a result: every record starts from Marina's words.
 */
import { actions, getDB } from '../store'
import { logLife } from '../intel/log'
import type { DateKey, DB, ID, Opportunity, OpportunityStatus, ProfessionalContact, ProfessionalWin } from '../types'
import { diffDays } from '@/lib/date'

export type Undo = () => void

export const OPP_STATUS_LABEL: Record<OpportunityStatus, string> = {
  radar: 'no radar',
  conversa: 'conversa',
  processo: 'em processo',
  entrevista: 'entrevista',
  proposta: 'proposta',
  fechada: 'fechada',
  descartada: 'descartada',
}

export const OPP_OPEN: OpportunityStatus[] = ['radar', 'conversa', 'processo', 'entrevista', 'proposta']
export const isOpenOpp = (o: Opportunity) => OPP_OPEN.includes(o.status)

/** Days without any movement after which an open opportunity needs a follow-up. */
export const FOLLOW_UP_DAYS = 5

export function openOpportunities(db: DB): Opportunity[] {
  const rank = (o: Opportunity) => OPP_OPEN.indexOf(o.status)
  return (db.opportunities ?? []).filter(isOpenOpp).sort((a, b) => rank(b) - rank(a) || (a.nextActionDate ?? '9').localeCompare(b.nextActionDate ?? '9'))
}

/** Open opportunities with no movement for FOLLOW_UP_DAYS and no follow-up scheduled ahead. */
export function staleOpportunities(db: DB, today: DateKey): (Opportunity & { days: number })[] {
  return openOpportunities(db)
    .filter((o) => !(o.nextActionDate && o.nextActionDate >= today))
    .map((o) => ({ ...o, days: diffDays(o.lastActivityAt ?? o.createdAt.slice(0, 10), today) }))
    .filter((o) => o.days >= FOLLOW_UP_DAYS)
}

export function dueFollowUps(db: DB, today: DateKey): ProfessionalContact[] {
  return (db.contacts ?? []).filter((c) => c.nextFollowUp && c.nextFollowUp <= today).sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!))
}

export function nextFollowUp(db: DB, today: DateKey): { who: string; date: DateKey; kind: 'contato' | 'oportunidade'; id: ID } | undefined {
  const fromContacts = (db.contacts ?? []).filter((c) => c.nextFollowUp).map((c) => ({ who: c.company ? `${c.name} (${c.company})` : c.name, date: c.nextFollowUp!, kind: 'contato' as const, id: c.id }))
  const fromOpps = openOpportunities(db).filter((o) => o.nextActionDate).map((o) => ({ who: `${o.role} · ${o.company}`, date: o.nextActionDate!, kind: 'oportunidade' as const, id: o.id }))
  void today
  return [...fromContacts, ...fromOpps].sort((a, b) => a.date.localeCompare(b.date))[0]
}

/** Evidence = wins promoted to executive cases. */
export const cases = (db: DB): ProfessionalWin[] => db.wins.filter((w) => w.evidence).sort((a, b) => b.date.localeCompare(a.date))
export const casesWithoutMetrics = (db: DB): ProfessionalWin[] => cases(db).filter((w) => !w.metrics?.trim())

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

/** Contacts whose first name / full name appears in the text (+ company when given). Never guesses between two. */
/** "empresa X" and "X" are the same company. */
export function companyKey(company: string): string {
  return fold(company).replace(/^(?:a |o )?empresa\s+/, '').trim()
}

/** The spelling already used for this company (opportunities, contacts), so one company never becomes two. */
export function canonicalCompany(db: DB, said: string): string | undefined {
  const k = companyKey(said)
  return [...(db.opportunities ?? []).map((o) => o.company), ...(db.contacts ?? []).map((c) => c.company)].find((c) => !!c && companyKey(c) === k)
}

export function matchContacts(db: DB, name: string, company?: string): ProfessionalContact[] {
  const n = fold(name)
  return (db.contacts ?? []).filter((c) => {
    const cn = fold(c.name)
    const nameOk = cn === n || cn.split(' ')[0] === n.split(' ')[0]
    const companyOk = !company || (c.company && companyKey(c.company).includes(companyKey(company)))
    return nameOk && companyOk
  })
}

/** Opportunities matching a company / role in the text. */
export function matchOpportunities(db: DB, text: string): Opportunity[] {
  const n = fold(text)
  return (db.opportunities ?? []).filter((o) => n.includes(fold(o.company)) || (o.role && n.includes(fold(o.role))))
}

// ─── Writes (each returns ONE undo; logs a LifeEvent) ───────────────────────

export function addOpportunity(input: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt' | 'history' | 'status'> & { status?: OpportunityStatus }, today: DateKey, by: 'marina' | 'lumos' = 'marina'): { item: Opportunity; undo: Undo } {
  const status = input.status ?? 'radar'
  const item = actions.create('opportunities', { ...input, status, lastActivityAt: today, history: [{ date: today, status }] })
  const log = logLife({ kind: 'created', date: today, title: `Oportunidade: ${item.role} · ${item.company}`, area: 'trabalho', ref: { type: 'opportunity', id: item.id }, by, provenance: 'user' })
  return {
    item,
    undo: () => {
      log.undo()
      actions.remove('opportunities', item.id)
    },
  }
}

export function setOpportunityStatus(id: ID, status: OpportunityStatus, today: DateKey, opts: { note?: string; by?: 'marina' | 'lumos' } = {}): Undo {
  const o = getDB().opportunities.find((x) => x.id === id)
  if (!o) return () => {}
  const before = { ...o }
  actions.update('opportunities', id, { status, lastActivityAt: today, history: [...(o.history ?? []), { date: today, status, note: opts.note }] })
  const log = logLife({ kind: status === 'descartada' ? 'cancelled' : 'changed', date: today, title: `${o.role} · ${o.company}: ${OPP_STATUS_LABEL[status]}`, area: 'trabalho', ref: { type: 'opportunity', id: o.id }, by: opts.by ?? 'marina', provenance: 'user' })
  return () => {
    log.undo()
    actions.update('opportunities', id, before)
  }
}

export function updateOpportunity(id: ID, patch: Partial<Opportunity>, today: DateKey): Undo {
  const o = getDB().opportunities.find((x) => x.id === id)
  if (!o) return () => {}
  const before = { ...o }
  actions.update('opportunities', id, { ...patch, lastActivityAt: today })
  return () => actions.update('opportunities', id, before)
}

/** "falei com a Ana da empresa X hoje" — updates the contact (creates only when she confirms elsewhere). */
export function logInteraction(contactId: ID, date: DateKey, note?: string, by: 'marina' | 'lumos' = 'marina'): Undo {
  const c = getDB().contacts.find((x) => x.id === contactId)
  if (!c) return () => {}
  const before = { ...c }
  actions.update('contacts', contactId, {
    lastInteraction: date,
    interactions: [...(c.interactions ?? []), { date, note }],
    // A follow-up that was due is considered done by talking to her.
    nextFollowUp: c.nextFollowUp && c.nextFollowUp <= date ? undefined : c.nextFollowUp,
  })
  const log = logLife({ kind: 'logged', date, title: `Conversou com ${c.name}${c.company ? ` (${c.company})` : ''}`, area: 'trabalho', ref: { type: 'contact', id: c.id }, by, provenance: 'user' })
  return () => {
    log.undo()
    actions.update('contacts', contactId, before)
  }
}

export function addContact(input: Omit<ProfessionalContact, 'id' | 'createdAt' | 'updatedAt'>, by: 'marina' | 'lumos' = 'marina'): { item: ProfessionalContact; undo: Undo } {
  const item = actions.create('contacts', input)
  const log = logLife({ kind: 'created', date: input.lastInteraction, title: `Contato: ${item.name}${item.company ? ` (${item.company})` : ''}`, area: 'trabalho', ref: { type: 'contact', id: item.id }, by, provenance: 'user' })
  return {
    item,
    undo: () => {
      log.undo()
      actions.remove('contacts', item.id)
    },
  }
}

/** A win becomes an executive case (same record). */
export function promoteToEvidence(winId: ID, patch: Partial<ProfessionalWin> = {}, by: 'marina' | 'lumos' = 'marina'): Undo {
  const w = getDB().wins.find((x) => x.id === winId)
  if (!w) return () => {}
  const before = { ...w }
  actions.update('wins', winId, { evidence: true, confidentiality: w.confidentiality ?? 'interno', verification: w.verification ?? 'rascunho', ...patch })
  const log = logLife({ kind: 'created', date: w.date, title: `Virou case: ${w.title}`, area: 'trabalho', ref: { type: 'win', id: w.id }, by, provenance: 'user' })
  return () => {
    log.undo()
    actions.update('wins', winId, before)
  }
}
