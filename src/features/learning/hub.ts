/**
 * Estudos (hub) — "se quiser estudar agora": WHAT (the Learning Engine's real options for this moment) and
 * WHEN (the next real free window of today, around the calendar and the blocks already on her day). Plus the
 * study agents' status, read only from real records. Pure: (db, date, nowMin) → view model; `putInDay` is the
 * one write (through the Home's allocation module).
 */
import { dayCapacity, type CapacityWindow } from '@/data/priority/capacity'
import type { DayContext } from '@/data/priority/contract'
import { completedHistory, nextSession, sessionDoneOn } from '@/data/spiritual/model'
import type { DateKey, DB, ID, PlannedBlock, StudySession } from '@/data/types'
import { formatDayMonth, hmToMinutes, minutesToHM } from '@/lib/date'
import { moveBlock, type Outcome } from '@/features/today/home/allocation'
import { checkinOf, dayContextFor } from '@/features/today/home/day-checkin'
import { lastEdited } from '@/features/atelie/model'
import { restAdvised, studyOptions, type StudyOption } from './candidates'
import { domainLabel, domainOfTrackId, TRACK_EN, TRACK_ES, trackName } from './engine/model'
import { dueCards } from './engine/srs'
import { radarDate, radarItems } from './radar'

export const REVIEW_ROUTE = '/estudos/aprendizagem?v=revisar'

export type StudyWhen =
  /** A real window today: start (rounded up to 5 min), the window's free minutes, and the minutes to plan. */
  | { kind: 'hoje'; start: string; freeMin: number; minutes: number }
  /** Already on her day. */
  | { kind: 'no_dia'; start: string; end: string }
  /** No free window today that fits it. */
  | { kind: 'amanha' }

export interface StudyNow {
  ctx: DayContext
  rest: boolean
  top?: StudyOption
  alternatives: StudyOption[]
  when?: StudyWhen
}

const live = (b: PlannedBlock) => b.status !== 'removido'

/** First window today where the option fits (min length), around what is already placed. */
export function nextWindow(windows: CapacityWindow[], minMin: number, maxMin: number): StudyWhen {
  for (const w of windows) {
    const start = Math.ceil(hmToMinutes(w.start) / 5) * 5
    const free = hmToMinutes(w.end) - start
    if (free >= Math.max(5, minMin)) return { kind: 'hoje', start: minutesToHM(start), freeMin: free, minutes: Math.min(maxMin, free) }
  }
  return { kind: 'amanha' }
}

export function studyNow(db: DB, date: DateKey, nowMin: number): StudyNow {
  const { ctx } = dayContextFor(db, date, nowMin)
  const options = studyOptions(db, ctx)
  const [top, ...rest] = options
  if (!top) return { ctx, rest: restAdvised(ctx), alternatives: [] }
  const placed = (checkinOf(db, date)?.blocks ?? []).filter(live)
  const mine = placed.find((b) => b.key === top.key && b.status === 'planejado')
  let when: StudyWhen
  if (mine) when = { kind: 'no_dia', start: mine.start, end: mine.end }
  else {
    const cap = dayCapacity(db, date, nowMin, ctx.energy, undefined, placed.map((b) => ({ start: b.start, end: b.end })))
    when = nextWindow(cap.windows, top.minMin, top.maxMin)
  }
  return { ctx, rest: restAdvised(ctx), top, alternatives: rest.slice(0, 2), when }
}

/** "Inglês", "IA", "Pós-graduação" — what the option is about. */
export function subjectOf(db: DB, o: Pick<StudyOption, 'trackId' | 'domain'>): string {
  return (o.trackId && trackName(db, o.trackId)) || domainLabel(db, o.domain)
}

/** Where "Começar" goes. */
export function startRoute(o: Pick<StudyOption, 'open' | 'trackId' | 'domain' | 'key'>): string {
  if (o.key === 'study:review') return REVIEW_ROUTE
  if (o.open?.kind === 'route' && o.open.to) return o.open.to
  if (o.trackId === TRACK_EN) return '/estudos/aprendizagem?v=ingles'
  return `/estudos/aprendizagem?area=${encodeURIComponent(o.domain)}`
}

/** "Pôr no meu dia": one planned block of hers (by: 'marina') in today's check-in, at the real window. Undoable. */
export function putInDay(date: DateKey, o: Pick<StudyOption, 'key' | 'title'>, when: Extract<StudyWhen, { kind: 'hoje' }>): Outcome {
  return moveBlock(date, { key: o.key, title: o.title, start: when.start, end: when.start }, when.start, when.minutes)
}

// ─── Agents ─────────────────────────────────────────────────────────────────

export interface StudyAgent {
  key: 'ingles' | 'espanhol' | 'ia_produto' | 'pos' | 'literario' | 'espiritualidade' | 'carreira'
  label: string
  to: string
  /** Real facts only; "sem evidência ainda" when there are none. */
  lines: string[]
}

const counted = (s: StudySession) => s.status !== 'planejado' && s.status !== 'abandonado'
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function learningLines(db: DB, today: DateKey, match: { tracks?: ID[]; domains?: string[] }): string[] {
  const inScope = (trackId?: ID, domain?: string) => (!!trackId && !!match.tracks?.includes(trackId)) || (!!domain && !!match.domains?.includes(domain))
  const sessions = (db.studySessions ?? []).filter((s) => counted(s) && s.date <= today && inScope(s.trackId, s.domain))
  const last = sessions.map((s) => s.date).sort().at(-1)
  const cards = (db.learningErrors ?? []).filter((c) => inScope(c.trackId, c.domain ?? (c.trackId ? domainOfTrackId(db, c.trackId) : undefined)))
  const due = dueCards(cards, today, Infinity).length
  const upcoming = cards.map((c) => c.nextReview).filter((d) => d > today).sort()[0]
  const step = db.studyItems.find((i) => i.status === 'estudando' && !i.reference && i.nextContent && inScope(i.trackId, i.domain))
  const lines: string[] = []
  if (last) lines.push(`última sessão ${formatDayMonth(last)}`)
  if (due) lines.push(`${plural(due, 'cartão', 'cartões')} para revisar hoje`)
  else if (upcoming) lines.push(`próxima revisão ${formatDayMonth(upcoming)}`)
  if (step) lines.push(`próximo: ${step.nextContent}`)
  return lines.length ? lines : ['sem evidência ainda']
}

/** One card per study agent whose place and data exist. `atelieLocked` hides even the Ateliê's dates. */
export function studyAgents(db: DB, today: DateKey, atelieLocked = false): StudyAgent[] {
  const out: StudyAgent[] = []
  const hasTrack = (id: ID) => db.studyTracks.some((t) => t.id === id)
  if (hasTrack(TRACK_EN)) out.push({ key: 'ingles', label: 'English Coach', to: '/estudos/aprendizagem?v=ingles', lines: learningLines(db, today, { tracks: [TRACK_EN] }) })
  if (hasTrack(TRACK_ES)) out.push({ key: 'espanhol', label: 'Espanhol', to: `/estudos?trilha=${encodeURIComponent(TRACK_ES)}`, lines: learningLines(db, today, { tracks: [TRACK_ES] }) })
  const iaTracks = db.studyTracks.filter((t) => ['ia', 'produto_negocios'].includes(domainOfTrackId(db, t.id))).map((t) => t.id)
  out.push({ key: 'ia_produto', label: 'IA & Produto', to: '/estudos/aprendizagem?area=ia', lines: learningLines(db, today, { tracks: iaTracks, domains: ['ia', 'produto_negocios'] }) })
  if (hasTrack('track-pos')) out.push({ key: 'pos', label: 'Faculdade / Pós', to: '/estudos?trilha=track-pos', lines: learningLines(db, today, { tracks: ['track-pos'] }) })

  const works = (db.literaryWorks ?? []).filter((w) => w.status !== 'arquivado')
  if (works.length || db.literaryProfile?.length) {
    const lastEdit = works.map((w) => lastEdited(db, w)).sort().at(-1)
    out.push({
      key: 'literario',
      label: 'Agente literário',
      to: '/atelie',
      lines: atelieLocked ? ['protegido'] : [works.length ? plural(works.length, 'obra', 'obras') : 'sem obras ainda', ...(lastEdit ? [`última edição ${formatDayMonth(lastEdit.slice(0, 10))}`] : [])],
    })
  }

  if (db.spiritualPlans?.length) {
    const done = completedHistory(db).map(sessionDoneOn).find(Boolean)
    const next = nextSession(db)
    const lines = [...(done ? [`último estudo ${formatDayMonth(done)}`] : []), ...(next ? [`próximo: ${next.scriptureReference}`] : [])]
    out.push({ key: 'espiritualidade', label: 'Espiritualidade', to: '/biblia', lines: lines.length ? lines : ['sem evidência ainda'] })
  }

  const papers = radarItems(db)
  out.push({
    key: 'carreira',
    label: 'Carreira & mercado',
    to: '/estudos#radar',
    lines: papers.length ? [`${plural(papers.length, 'newsletter', 'newsletters')} de vagas`, `última ${formatDayMonth(radarDate(papers[0]))}`] : ['nenhuma newsletter ainda'],
  })
  return out
}
