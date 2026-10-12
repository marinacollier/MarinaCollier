/**
 * CRM Marcas + UGC Business plan — what Marina stated on 12/10/2026 (the sheet itself was not provided:
 * its full content arrives through "Importar CRM" in the UGC space, with the same reconciliation).
 *
 * Applied once per install, additively and idempotently (stable ids, `profile.seedIds`):
 * - brands are reconciled by name + explicit aliases (never a look-alike), newer data of hers is kept;
 * - tasks are created once and never reopened or recreated (done/deleted stay so);
 * - nothing invented: no coupon code, contact, time or date she didn't give.
 *
 * Ids use the 'ugc-crm:' prefix on purpose: they are not 'seed:' records, so the life-seed migration
 * never "retires" them (they are reconciled here, not rebuilt by buildSeed).
 */
import type { ContentItem, DateKey, DB, Task } from '../types'
import { matchBrand, reconcileCrm, type CrmRow } from '../ugc/crm'
import { SEED_IDS } from './ids'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'

export const UGC_CRM_DATE: DateKey = '2026-10-12'
const NEG_DATE: DateKey = '2026-10-11'
const PROPOSAL_DATE: DateKey = '2026-10-11'

const AFFILIATES = ['Hardyn', 'ELA UP', 'Pink Cheeks', 'Bora Nutrition']
const PRESS_KITS = ['Natusvita', 'Vitergyl', 'Breevo', 'Feelgomy', 'Alright', 'VHydra']
const NEGATIVES = ['Rituária', 'Z2 Performance', 'Snugg Wear', 'Yoclay', 'Mahta', 'Ocean Drop', 'ADA Nutracêuticos', 'HEY!MU', 'HolyFoods']
export const PROPOSALS_2026_10_11 = ['Angê', 'Kaisan Brasil', 'Studio Athletic Club', 'Liore Floral Studio', 'Flower Club', 'Oh! Flores', 'Bem Me Quer Flores & Design', 'Flor da Cidade', 'Camélia Floricultura', 'Luna Flores', 'Claratí Flores e Plantas', 'Giu Flores']
const PAID_PROSPECTS = ['Woom', 'Cumbuca Boa', 'Nomad', 'Insider', 'Vhita', 'Zerezes', 'Liquidz', 'Yaru']

export const UGC_CRM_ROWS: CrmRow[] = [
  ...AFFILIATES.map((name): CrmRow => ({ name, status: 'afiliada_sem_vagas', affiliate: true, evidence: 'Afiliada — a marca não tem vagas de UGC/influencer. Cupom mantido.' })),
  ...PRESS_KITS.map((name): CrmRow => ({ name, status: 'press_kit', pressKit: true })),
  ...NEGATIVES.map((name): CrmRow => ({ name, status: 'negativa', statusAt: NEG_DATE, evidence: 'Negativa confirmada em 11/10/2026 — removida da comunidade.' })),
  { name: 'Outlive Nutrition', status: 'aguardando_resposta', evidence: 'Aguardando resposta (não é negociação). Data da última mensagem a conferir.' },
  ...PROPOSALS_2026_10_11.map((name): CrmRow => ({ name, status: 'aguardando_retorno', statusAt: PROPOSAL_DATE, proposalSentAt: PROPOSAL_DATE, followUpFrom: '2026-10-18', followUpTo: '2026-10-21', evidence: 'Proposta enviada em 11/10/2026. Follow-up 18–21/10 só se não responder.' })),
  ...PAID_PROSPECTS.map((name): CrmRow => ({ name, paidProspect: true })),
]

const id = (kind: string, slug: string) => `ugc-crm:${kind}:${slug}`

interface SeedTask {
  slug: string
  title: string
  priority?: Task['priority']
  doneCriteria?: string
  durationMin?: number
  date?: DateKey
  dueDate?: DateKey
  bucket?: Task['bucket']
  brand?: string
  demo?: string
}

export const UGC_TASKS: SeedTask[] = [
  { slug: 'configurar-modulo', title: 'Configurar módulo UGC Business no Marina OS', priority: 'alta', doneCriteria: 'Módulo criado e navegação funcionando.', durationMin: 30, date: '2026-10-12' },
  { slug: 'biblioteca-portfolio', title: 'Preparar biblioteca do portfólio UGC', priority: 'alta', doneCriteria: 'Estrutura pronta para receber vídeos.', durationMin: 15, date: '2026-10-12' },
  { slug: 'tres-roteiros', title: 'Definir três roteiros de vídeos demonstrativos — Breevo, VHydra, Fluy da Bora Nutrition', priority: 'alta', doneCriteria: 'Roteiro e cenas registrados.', durationMin: 30, date: '2026-10-12' },
  { slug: 'importar-crm', title: 'Importar e reconciliar o CRM', priority: 'alta', doneCriteria: 'Planilha CRM Marcas colada em "Importar CRM" e marcas conferidas, sem duplicatas.', durationMin: 20, date: '2026-10-12' },
  { slug: 'revisar-prospects', title: 'Revisar prospects comerciais — Woom, Cumbuca Boa, Nomad, Insider', priority: 'media', durationMin: 20, date: '2026-10-12' },
  { slug: 'outlive-ultimo-contato', title: 'Conferir último contato com Outlive Nutrition', priority: 'media', doneCriteria: 'Data da última mensagem conferida e follow-up definido.', durationMin: 5, date: '2026-10-12', brand: 'Outlive Nutrition' },
  { slug: 'respostas-11-10', title: 'Revisar respostas das 12 marcas de 11/10 — follow-up só para quem não respondeu', doneCriteria: 'Respostas registradas; follow-up enviado apenas a quem não respondeu.', date: '2026-10-18', dueDate: '2026-10-21' },
  { slug: 'gravar-demos', title: 'Gravar 3 vídeos demonstrativos', dueDate: '2026-10-18', bucket: 'semana' },
  { slug: 'editar-demos', title: 'Editar e selecionar os vídeos demonstrativos', dueDate: '2026-10-18', bucket: 'semana' },
  { slug: 'portfolio-publico', title: 'Atualizar portfólio público', dueDate: '2026-10-18', bucket: 'semana' },
  { slug: 'proposta-comercial', title: 'Preparar proposta comercial de UGC', dueDate: '2026-10-18', bucket: 'semana' },
  { slug: 'lista-prospects-pagos', title: 'Revisar primeira lista de prospects de UGC pago', dueDate: '2026-10-18', bucket: 'semana' },
]

/** Portfolio pieces — her production with products she has; never paid contracts. */
export const UGC_DEMOS: { slug: string; title: string; product: string; brand: string }[] = [
  { slug: 'vhydra', title: 'Demo VHydra', product: 'VHydra', brand: 'VHydra' },
  { slug: 'natusvita', title: 'Demo Vitaminas Natusvita', product: 'Vitaminas Natusvita', brand: 'Natusvita' },
  { slug: 'breevo', title: 'Demo Dilatador nasal Breevo', product: 'Dilatador nasal Breevo', brand: 'Breevo' },
  { slug: 'vitergyl', title: 'Demo Vitamina C Vitergyl', product: 'Vitamina C Vitergyl', brand: 'Vitergyl' },
  { slug: 'fluy', title: 'Demo Fluy (carboidrato e eletrólitos) — Bora Nutrition', product: 'Fluy (carboidrato e eletrólitos)', brand: 'Bora Nutrition' },
]

export const ugcTaskId = (s: string) => id('task', s)
export const ugcDemoId = (s: string) => id('demo', s)

/** Apply the CRM facts, tasks and demo projects. Idempotent; never reopens, recreates or overwrites hers. */
export function applyUgcCrmSeed(db: DB, now: string = nowISO()): DB {
  const received = new Set(db.profile.seedIds ?? [])
  const removed = new Set(db.profile.removedSeedIds ?? [])
  const mayCreate = (x: string) => !received.has(x) && !removed.has(x)
  // Coupons she already wrote on old partnerships come along (the code as she typed it).
  const couponRows: CrmRow[] = db.partnerships.filter((p) => p.coupon?.trim() && p.brand?.trim()).map((p) => ({ name: p.brand, coupon: p.coupon!.trim() }))
  const { db: next } = reconcileCrm(db, [...UGC_CRM_ROWS, ...couponRows], { now, brandId: (k) => id('brand', k), oppId: (k, kind) => id('opp', `${k}:${kind}`), mayCreate })
  const out: DB = { ...next }
  const seen = new Set<string>()
  const sameTitle = (t: Task, title: string) => t.status !== 'archived' && normalize(t.title) === normalize(title)

  const items: ContentItem[] = [...out.contentItems]
  for (const [i, d] of UGC_DEMOS.entries()) {
    const cid = ugcDemoId(d.slug)
    seen.add(cid)
    if (items.some((c) => c.id === cid || (c.demo && normalize(c.title) === normalize(d.title))) || !mayCreate(cid)) continue
    items.push({ id: cid, createdAt: now, updatedAt: now, title: d.title, stage: 'ideia', format: 'Vídeo demonstrativo', projectId: SEED_IDS.projUGC, brandId: matchBrand(out.brands, d.brand)?.id, links: [], order: 900 + i, demo: { product: d.product, scenes: [], editStatus: 'nao_iniciada', inPortfolio: false } })
  }
  if (items.length !== out.contentItems.length) out.contentItems = items

  const tasks: Task[] = [...out.tasks]
  for (const [i, t] of UGC_TASKS.entries()) {
    const tid = ugcTaskId(t.slug)
    seen.add(tid)
    // Exists (open, done or cancelled) → never touched; deleted by her → never back; she wrote it → not twice.
    if (tasks.some((x) => x.id === tid || sameTitle(x, t.title)) || !mayCreate(tid)) continue
    const brand = t.brand ? matchBrand(out.brands, t.brand) : undefined
    tasks.push({
      id: tid,
      createdAt: now,
      updatedAt: now,
      title: t.title,
      status: 'todo',
      date: t.date,
      dueDate: t.dueDate,
      bucket: t.bucket ?? (t.date ? undefined : 'semana'),
      priority: t.priority,
      durationMin: t.durationMin,
      doneCriteria: t.doneCriteria,
      notes: t.doneCriteria ? `Feito quando: ${t.doneCriteria}` : undefined,
      context: 'conteudo',
      projectId: SEED_IDS.projUGC,
      brandId: brand?.id,
      tags: ['ugc'],
      order: 950 + i,
    })
  }
  if (tasks.length !== out.tasks.length) out.tasks = tasks

  for (const b of out.brands) if (b.id.startsWith('ugc-crm:')) seen.add(b.id)
  for (const o of out.ugcOpportunities) if (o.id.startsWith('ugc-crm:')) seen.add(o.id)
  const ids = [...new Set([...(db.profile.seedIds ?? []), ...seen])]
  const changed = next !== db || out.contentItems !== db.contentItems || out.tasks !== db.tasks
  if (!changed && ids.length === (db.profile.seedIds ?? []).length) return db
  out.profile = { ...out.profile, seedIds: ids }
  return out
}
