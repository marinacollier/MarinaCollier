/**
 * Executive Career Review — monthly, her six questions. The draft is assembled from what is already
 * recorded (activities, opportunities, contacts, wins/cases, blockers); she edits and saves. Facts only:
 * no readiness score, no "você está X% pronta".
 */
import { actions, getDB } from '../store'
import { logLife } from '../intel/log'
import { isCareerQuota } from '../selectors'
import type { DB, MonthlyReview } from '../types'
import { CAREER_META } from './activities'
import { OPP_STATUS_LABEL, casesWithoutMetrics, staleOpportunities } from './pipeline'
import { nowISO } from '@/lib/id'

export type Undo = () => void
export type CareerAnswers = NonNullable<MonthlyReview['career']>

export const careerReviewId = (month: string) => `career-review-${month}`

export const REVIEW_QUESTIONS: { key: keyof Omit<CareerAnswers, 'priorities'>; label: string }[] = [
  { key: 'advanced', label: 'O que avancei?' },
  { key: 'opportunities', label: 'Quais oportunidades surgiram?' },
  { key: 'skills', label: 'Que competências desenvolvi?' },
  { key: 'results', label: 'Quais resultados documentei?' },
  { key: 'blocked', label: 'O que está bloqueado?' },
]

const inMonth = (month: string) => (d?: string) => !!d && d.slice(0, 7) === month

/** Draft answers from existing data. Empty strings where nothing was recorded (she writes). */
export function reviewDraft(db: DB, month: string, today: string): CareerAnswers {
  const m = inMonth(month)
  const quotaIds = new Set(db.tasks.filter(isCareerQuota).map((t) => t.id))
  const counts = new Map<string, number>()
  const minutes = new Map<string, number>()
  const bump = (kind: string | undefined, mins?: number) => {
    if (!kind) return
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
    minutes.set(kind, (minutes.get(kind) ?? 0) + (mins ?? 0))
  }
  for (const t of db.tasks) if (t.careerParentId && t.status === 'done' && m(t.date)) bump(t.careerKind, t.durationMin)
  for (const o of db.occurrences) if (o.parentType === 'task' && quotaIds.has(o.parentId) && m(o.date)) bump(db.tasks.find((t) => t.id === o.parentId)?.careerKind, o.durationMin)
  const activity = [...counts.entries()].map(([k, c]) => `${CAREER_META[k as keyof typeof CAREER_META].label}: ${k === 'lideranca' ? `${minutes.get(k)} min` : `${c}×`}`)

  const opps = db.opportunities.filter((o) => o.history?.some((h) => m(h.date)))
  const oppLines = opps.map((o) => `${o.role} · ${o.company} (${OPP_STATUS_LABEL[o.status]})`)
  const talks = db.contacts.flatMap((c) => (c.interactions ?? []).filter((i) => m(i.date)).map(() => c.name))
  const wins = db.wins.filter((w) => m(w.date))
  const goalsDone = db.goals.filter((g) => g.category === 'profissional' && g.status === 'feita' && m(g.updatedAt.slice(0, 10)))

  const blocked = [
    ...staleOpportunities(db, today).map((o) => `${o.role} · ${o.company}: sem follow-up há ${o.days} dias`),
    ...casesWithoutMetrics(db).map((w) => `Case sem métricas: ${w.title}`),
    ...db.tasks.filter((t) => t.status === 'waiting' && t.waiting && (t.projectId || t.context === 'trabalho' || t.context === 'carreira')).map((t) => `Esperando ${t.waiting!.who}: ${t.title}`),
  ]

  return {
    advanced: [...activity, ...goalsDone.map((g) => `Objetivo concluído: ${g.title}`)].join('\n'),
    opportunities: [...oppLines, ...(talks.length ? [`Conversas de networking: ${talks.length} (${[...new Set(talks)].join(', ')})`] : [])].join('\n'),
    skills: counts.has('lideranca') ? `Liderança: ${minutes.get('lideranca')} min de desenvolvimento` : '',
    results: wins.map((w) => `${w.title}${w.metrics ? ` — ${w.metrics}` : ''}${w.evidence ? ' (case)' : ''}`).join('\n'),
    blocked: blocked.join('\n'),
    priorities: [],
  }
}

export function savedReview(db: DB, month: string): MonthlyReview | undefined {
  return db.monthlyReviews.find((r) => r.id === careerReviewId(month) || (r.kind === 'carreira' && r.month === month))
}

/** One review per month (deterministic id) — saving again updates it, never duplicates. */
export function saveCareerReview(month: string, answers: CareerAnswers, by: 'marina' | 'lumos' = 'marina'): Undo {
  const existing = savedReview(getDB(), month)
  const priorities = (answers.priorities ?? []).map((p) => p.trim()).filter(Boolean).slice(0, 3)
  const data = { month, kind: 'carreira' as const, highlights: priorities, career: { ...answers, priorities }, completedAt: nowISO() }
  let undoWrite: Undo
  if (existing) {
    const before = { ...existing }
    actions.update('monthlyReviews', existing.id, data)
    undoWrite = () => actions.update('monthlyReviews', existing.id, before)
  } else {
    const r = actions.create('monthlyReviews', { id: careerReviewId(month), ...data })
    undoWrite = () => actions.remove('monthlyReviews', r.id)
  }
  const log = logLife({ kind: 'done', date: `${month}-01`, title: `Executive Career Review de ${month} salva`, area: 'trabalho', by, provenance: 'user' })
  return () => {
    log.undo()
    undoWrite()
  }
}

export const careerReviews = (db: DB): MonthlyReview[] => db.monthlyReviews.filter((r) => r.kind === 'carreira').sort((a, b) => b.month.localeCompare(a.month))
