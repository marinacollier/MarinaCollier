/**
 * Personal Priority Engine — "o que faz sentido fazer agora?". Pure and deterministic: (db, ctx) → a small plan.
 *
 * Contextual MoSCoW (her explicit `moscow` always wins):
 *   must    deadline ≤ 48 h · prep for a real commitment ≤ 48 h · ficou de antes (carried from an earlier day)
 *   should  planned for today · linked to an active goal · a project with planned weekly hours
 *   could   everything else
 *   wont_now only ever listed under "Podem esperar"
 * Score inside the band (0–100) = RICE-lite (0–60, or her priority when there is no RICE) + urgency (0–25)
 * + alignment (0–15). Every component pushes a pt-BR reason.
 *
 * Plan: essentials first (never ranked away), then ONE primary (best must, else best should) that fits the
 * focus minutes and the energy (energyNeed ≤ energy + 1), up to 2 secondary, and ≥ 20 % of the free time
 * kept as "Espaço livre". Low energy (1–2): shorter items, at most 1 secondary, rest suggested explicitly.
 * Everything else → "Podem esperar" with a short, kind reason. Rest is never "low priority": it is the
 * space the plan keeps free on purpose.
 *
 * Study (Learning Engine, every domain) never dominates: at most the best 2 study candidates compete.
 * Her interest of the day (check-in "Interesse de hoje", the note, or Lumos) filters and boosts:
 *   "quero estudar política" → matching candidates +20 · "não quero idiomas" → those wait ·
 *   "quero descansar" → no study, nothing extra beyond a real must, rest proposed explicitly.
 */
import type { CalendarEntry } from '../calendar/universal'
import { addDays, diffDays, hmToMinutes, minutesToHM } from '@/lib/date'
import type { DateKey, DB, Task } from '../types'
import type { Candidate, DayContext, Energy, MoSCoW } from './contract'
import { energyFactor, type CapacityWindow } from './capacity'
import { essentialsFor, gatherCandidates, type RawCandidate } from './sources'

export const PRIORITY_WEIGHTS = {
  /** RICE-lite normalized to 0–60 ((reach × impact × confidence) / effort; max 25). */
  rice: 60,
  riceMax: 25,
  /** Without RICE: her own priority mark (alta/média/baixa) inside the same 0–60 slot. */
  priority: { alta: 45, media: 30, baixa: 15, none: 20 },
  urgency: 25,
  alignment: 15,
  /** Kept free of the free time, always. */
  freeShare: 0.2,
  /** Low energy: items are capped to this many minutes. */
  lowEnergyMaxMin: 30,
  /** At most this many study candidates compete (the rest wait). */
  maxStudy: 2,
  /** Boost for a candidate that matches her stated interest. */
  interestBoost: 20,
} as const

// ─── Interest of the day ────────────────────────────────────────────────────

export interface Interest {
  rest: boolean
  want: string[]
  avoid: string[]
}

const fold = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
const STOP = new Set([
  'quero',
  'estudar',
  'fazer',
  'hoje',
  'mais',
  'menos',
  'algo',
  'sobre',
  'pouco',
  'gostaria',
  'vontade',
  'nada',
  'pra',
  'para',
  'com',
  'de',
  'do',
  'da',
  'um',
  'uma',
  'nao',
  'sem',
  'ler',
  'ver',
  'focar',
  'foco',
  'em',
  'no',
  'na',
  'e',
  'o',
  'a',
])
const words = (t: string) =>
  fold(t)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
/** "idiomas" also means inglês/espanhol… (study titles name the language, not the area). */
const SYNONYMS: Record<string, string[]> = {
  idiomas: ['idioma', 'ingles', 'espanhol', 'frances', 'italiano', 'alemao', 'english'],
  idioma: ['ingles', 'espanhol'],
  estudo: ['estudar', 'study'],
  estudos: ['estudar', 'study'],
}

/** Reads her stated interest: rest · what she wants · what she does not want today. Deterministic. */
export function interestOf(text: string | undefined): Interest {
  const t = fold(text ?? '')
  const rest = /\b(descansar|descanso|repousar|folga|nao quero fazer nada|so quero relaxar|relaxar)\b/.test(t)
  const avoid: string[] = []
  const want: string[] = []
  for (const part of t.split(/[,.;]|\be\b|\bmas\b/)) {
    const neg = /\b(nao|sem|nada de)\b/.test(part)
    for (const w of words(part)) {
      if (/^(descans|repous|relax|folga)/.test(w)) continue
      ;(neg ? avoid : want).push(w, ...(SYNONYMS[w] ?? []))
    }
  }
  return { rest, want, avoid }
}

const isStudy = (c: Candidate) => c.key.startsWith('study:') || c.open?.kind === 'study'
const matches = (c: Candidate, list: string[]) => {
  if (!list.length) return false
  const hay = fold(`${c.title} ${c.area} ${c.key} ${c.subject ?? ''} ${(c.contributesTo ?? []).join(' ')}`)
  return list.some((w) => hay.includes(w))
}

const BAND: Record<MoSCoW, number> = {
  must: 0,
  should: 1,
  could: 2,
  wont_now: 3,
}

export interface PlanItem {
  c: Candidate
  minutes: number
  slot?: CapacityWindow
}

export interface DayPlan {
  essentials: Candidate[]
  primary?: PlanItem
  secondary: PlanItem[]
  later: { c: Candidate; why: string }[]
  freeMin: number
  focusMin: number
  /** Minutes the plan leaves free on purpose (≥ 20 % of freeMin). */
  freeSpaceMin: number
  lowEnergy: boolean
  /** A gentle line when rest is the smartest thing ("Energia baixa: …"). */
  restHint?: string
}

export interface PlanOptions {
  /** Free windows from capacity (suggested time slots). */
  windows?: CapacityWindow[]
  /** Keys she moved out of today (hoje não · trocar · mais tarde · adiar · concluir) → the reason shown. */
  skip?: Record<string, string>
  /** Calendar entries already read (avoids reading them twice). */
  entries?: CalendarEntry[]
}

// ─── MoSCoW + score ─────────────────────────────────────────────────────────

const dayWord = (d: number) => (d < 0 ? `venceu há ${-d} dia${d === -1 ? '' : 's'}` : d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias`)

function activeGoal(db: DB, t: Task): string | undefined {
  const ids = [...(t.goalIds ?? []), ...(t.goalId ? [t.goalId] : [])]
  return db.goals.find((g) => ids.includes(g.id) && g.status === 'ativa')?.title
}

function weeklyProject(db: DB, t: Task) {
  const p = t.projectId ? db.projects.find((x) => x.id === t.projectId) : undefined
  return p && p.status === 'ativo' && (p.weeklyHours ?? 0) > 0 ? p : undefined
}

/** Contextual MoSCoW + the reason that decided it. */
export function moscowOf(db: DB, c: RawCandidate, ctx: DayContext): { moscow: MoSCoW; why: string } {
  const t = c.task
  if (t?.moscow) return { moscow: t.moscow, why: 'Tu marcou assim' }
  if (c.moscow) return { moscow: c.moscow, why: 'Definido pela origem' }
  if (c.prepFor && diffDays(ctx.date, c.prepFor) <= 2)
    return {
      moscow: 'must',
      why: 'Preparo para um compromisso real em até 48 h',
    }
  if (c.deadline && diffDays(ctx.date, c.deadline) <= 2)
    return {
      moscow: 'must',
      why: `Prazo: ${dayWord(diffDays(ctx.date, c.deadline))}`,
    }
  if (t && !t.recurrence && t.date && t.date < ctx.date) return { moscow: 'must', why: 'Ficou de antes — só pra não se perder' }
  if (t?.date === ctx.date) return { moscow: 'should', why: 'Tu planejou pra hoje' }
  if (t && activeGoal(db, t)) return { moscow: 'should', why: `Ajuda na meta "${activeGoal(db, t)}"` }
  if (t && weeklyProject(db, t))
    return {
      moscow: 'should',
      why: `Projeto com horas na semana (${weeklyProject(db, t)!.name})`,
    }
  return { moscow: 'could', why: 'Pode entrar quando sobrar espaço' }
}

/** Score 0–100 inside the band, with every component as a reason. */
export function scoreOf(db: DB, c: RawCandidate, ctx: DayContext): { score: number; reasons: string[] } {
  const W = PRIORITY_WEIGHTS
  const reasons: string[] = []
  const t = c.task
  let value: number
  if (t?.rice) {
    const r = t.rice
    const raw = (r.reach * r.impact * r.confidence) / r.effort
    value = Math.round((Math.min(raw, W.riceMax) / W.riceMax) * W.rice)
    reasons.push(`Impacto (RICE) ${value}/${W.rice}`)
  } else if (t) {
    value = W.priority[t.priority ?? 'none']
    if (t.priority) reasons.push(`Prioridade ${t.priority === 'media' ? 'média' : t.priority} (${value}/${W.rice})`)
  } else if (c.prepFor) {
    // Preparing for a real commitment is worth what the commitment is worth: the closer it is, the more
    // (today = full slot, so prep for tonight's meeting beats a task that only "ficou de antes").
    const d = diffDays(ctx.date, c.prepFor)
    value = d <= 0 ? W.rice : d === 1 ? W.priority.alta : W.priority.media
    reasons.push(`Preparação de compromisso (${value}/${W.rice})`)
  } else value = c.score ?? W.priority.none

  let urgency = 0
  const deadline = c.prepFor ?? c.deadline
  if (deadline) {
    const d = diffDays(ctx.date, deadline)
    urgency = d <= 0 ? 25 : d === 1 ? 20 : d === 2 ? 15 : d <= 7 ? 10 : d <= 14 ? 5 : 0
    if (urgency) reasons.push(`Urgência ${urgency}/${W.urgency} (${c.prepFor ? 'compromisso' : 'prazo'} ${d <= 0 ? 'hoje' : `em ${d} dia${d === 1 ? '' : 's'}`})`)
  } else if (t && !t.recurrence && t.date && t.date < ctx.date) {
    urgency = 20
    reasons.push(`Urgência ${urgency}/${W.urgency} (ficou de antes)`)
  }

  let alignment = 0
  if (t) {
    const goal = activeGoal(db, t)
    const proj = weeklyProject(db, t)
    if (goal) alignment = W.alignment
    else if (proj) alignment = 10
    else if (t.projectId) alignment = 5
    if (alignment) reasons.push(`Alinhamento ${alignment}/${W.alignment} (${goal ? `meta "${goal}"` : 'projeto ativo'})`)
  }
  return {
    score: Math.max(0, Math.min(100, value + urgency + alignment)),
    reasons,
  }
}

/** Every candidate with its contextual MoSCoW, score and reasons, sorted (band, score, key). */
export function rankCandidates(db: DB, ctx: DayContext, entries?: CalendarEntry[]): Candidate[] {
  const out = gatherCandidates(db, ctx, entries).map((raw): Candidate => {
    const m = moscowOf(db, raw, ctx)
    const s = scoreOf(db, raw, ctx)
    const { task: _t, prepFor: _p, reasons: pre = [], ...rest } = raw
    void _t
    void _p
    return {
      ...rest,
      moscow: m.moscow,
      score: s.score,
      reasons: [m.why, ...s.reasons, ...pre],
    }
  })
  return out.map((c) => withHistory(db, c, ctx.date)).sort((a, b) => BAND[a.moscow] - BAND[b.moscow] || b.score - a.score || a.key.localeCompare(b.key))
}

/**
 * Learns from her decisions, gently: something she took out of her day (hoje não · trocar · adiar) on 2+
 * different days in the last 14 sinks a little, with the reason shown. One single decision never changes
 * anything, and a must (deadline, real commitment) never sinks below its band.
 */
export const HISTORY = { days: 14, minDays: 2, penalty: 15 } as const
function withHistory(db: DB, c: Candidate, date: DateKey): Candidate {
  const from = addDays(date, -HISTORY.days)
  const days = new Set(
    (db.dayCheckins ?? [])
      .filter((d) => d.date >= from && d.date < date)
      .filter((d) => d.changes.some((ch) => ch.key === c.key && (ch.action === 'hoje_nao' || ch.action === 'trocar' || ch.action === 'adiar')))
      .map((d) => d.date),
  )
  if (days.size < HISTORY.minDays) return c
  return { ...c, score: Math.max(0, c.score - HISTORY.penalty), reasons: [...c.reasons, `Tu tiraste isso do dia ${days.size}× nas últimas 2 semanas — fica mais abaixo (−${HISTORY.penalty})`] }
}

// ─── Plan ───────────────────────────────────────────────────────────────────

const round5 = (n: number) => Math.max(0, Math.floor(n / 5) * 5)

/** First window (from now) long enough for `minutes`, as a suggested slot. */
function slotFor(windows: CapacityWindow[], used: Map<number, number>, minutes: number, nowMin: number): CapacityWindow | undefined {
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]
    const start = Math.max(hmToMinutes(w.start), nowMin) + (used.get(i) ?? 0)
    if (hmToMinutes(w.end) - start >= minutes) {
      used.set(i, (used.get(i) ?? 0) + minutes)
      return { start: minutesToHM(start), end: minutesToHM(start + minutes) }
    }
  }
  return undefined
}

export function planDay(db: DB, ctx: DayContext, opts: PlanOptions = {}): DayPlan {
  return planFromCandidates(db, ctx, rankCandidates(db, ctx, opts.entries), opts)
}

/** The plan for an already scored list of candidates (planDay's second half; also for tests/other producers). */
export function planFromCandidates(db: DB, ctx: DayContext, candidates: Candidate[], opts: PlanOptions = {}): DayPlan {
  const W = PRIORITY_WEIGHTS
  const nowMin = hmToMinutes(ctx.now)
  const energy: Energy = ctx.energy
  const lowEnergy = energy <= 2
  const essentials = essentialsFor(db, ctx.date, nowMin).candidates
  const freeMin = round5(Math.max(0, ctx.freeMin))
  const keep = Math.ceil(freeMin * W.freeShare)
  const usable = Math.max(0, freeMin - keep)
  const focusMin = Math.min(usable, ctx.focusMin ?? round5(freeMin * energyFactor(energy)))
  const cap = lowEnergy ? W.lowEnergyMaxMin : Infinity
  const fitsEnergy = (c: Candidate) => c.energyNeed <= energy + 1

  const interest = interestOf(ctx.interest)
  const later: DayPlan['later'] = []
  const pool: Candidate[] = []
  let studies = 0
  const ranked = candidates.map((c) =>
    matches(c, interest.want) && !matches(c, interest.avoid)
      ? {
          ...c,
          score: Math.min(100, c.score + W.interestBoost),
          reasons: [...c.reasons, `Combina com teu interesse de hoje (+${W.interestBoost})`],
        }
      : c,
  )
  ranked.sort((a, b) => BAND[a.moscow] - BAND[b.moscow] || b.score - a.score || a.key.localeCompare(b.key))
  for (const c of ranked) {
    const skipped = opts.skip?.[c.key]
    if (skipped) later.push({ c, why: skipped })
    else if (c.moscow === 'wont_now') later.push({ c, why: 'Tu marcou como "agora não"' })
    else if (matches(c, interest.avoid)) later.push({ c, why: 'Tu disse que hoje não' })
    else if (isStudy(c) && interest.rest) later.push({ c, why: 'Hoje é dia de descansar' })
    else if (isStudy(c) && studies >= W.maxStudy) later.push({ c, why: 'Um ou dois estudos por dia já bastam' })
    else if (interest.rest && c.moscow !== 'must') later.push({ c, why: 'Hoje é dia de descansar' })
    else {
      if (isStudy(c)) studies++
      pool.push(c)
    }
  }

  const used = new Map<number, number>()
  const windows = opts.windows ?? []
  const take = (c: Candidate, budget: number): PlanItem | undefined => {
    if (!fitsEnergy(c) || c.minMin > Math.min(budget, cap)) return undefined
    const minutes = Math.min(c.maxMin, budget, cap)
    return { c, minutes, slot: slotFor(windows, used, minutes, nowMin) }
  }

  let primary: PlanItem | undefined
  for (const c of pool) {
    if (c.moscow !== 'must' && c.moscow !== 'should') break
    primary = take(c, focusMin)
    if (primary) break
  }

  const secondary: PlanItem[] = []
  let left = usable - (primary?.minutes ?? 0)
  const maxSecondary = interest.rest ? 0 : lowEnergy ? 1 : 2
  for (const c of pool) {
    if (secondary.length >= maxSecondary || left < 10) break
    if (c === primary?.c) continue
    const item = take(c, left)
    if (!item) continue
    secondary.push(item)
    left -= item.minutes
  }

  const chosen = new Set([primary?.c.key, ...secondary.map((s) => s.c.key)])
  for (const c of pool) {
    if (chosen.has(c.key)) continue
    const why = !fitsEnergy(c)
      ? 'Pede mais energia do que tu tem hoje'
      : c.minMin > Math.min(usable, cap)
        ? 'Não cabe no tempo de hoje'
        : c.moscow === 'could'
          ? 'Pode ficar pra outro dia, sem prejuízo'
          : 'Hoje já tem o suficiente'
    later.push({ c, why })
  }

  const usedMin = (primary?.minutes ?? 0) + secondary.reduce((s, i) => s + i.minutes, 0)
  return {
    essentials,
    primary,
    secondary,
    later,
    freeMin,
    focusMin,
    freeSpaceMin: Math.max(keep, freeMin - usedMin),
    lowEnergy,
    restHint: interest.rest
      ? 'Hoje o plano é descansar. Só o essencial — o resto espera sem culpa.'
      : lowEnergy
        ? 'Energia baixa: descansar também é parte do plano. Uma coisa pequena já basta.'
        : undefined,
  }
}
