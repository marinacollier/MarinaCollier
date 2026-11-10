/**
 * Contract between the Personal Priority Engine (src/data/priority/*) and the modules that feed it
 * candidates (Learning Engine in src/features/learning/*, tasks, projects, routines…).
 * Pure types only — no logic here, so both sides can be built independently.
 */
import type { DateKey, ID, TimeHM } from '../types'

export type Energy = 1 | 2 | 3 | 4 | 5 // muito baixa … muito alta
export type MoSCoW = 'must' | 'should' | 'could' | 'wont_now'

/** Life areas used across the engine (section 10 of the Master Upgrade). */
export type LifeArea =
  | 'trabalho'
  | 'voluntariado'
  | 'idiomas'
  | 'faculdade'
  | 'estudos'
  | 'esportes'
  | 'luna'
  | 'autocuidado'
  | 'criatividade'
  | 'financas'
  | 'social'

/** What the day looks like when the engine runs (from the check-in + calendar). */
export interface DayContext {
  date: DateKey
  /** Minutes free for flexible activities (already net of commitments, buffers and margin). */
  freeMin: number
  /** Minutes she said she has for focus (≤ freeMin); undefined = derive from freeMin. */
  focusMin?: number
  energy: Energy
  /** Now, in the active local time ('HH:MM'). */
  now: TimeHM
  /** Free text she wrote ("reunião importante amanhã"). Never parsed into facts silently. */
  note?: string
  /** Interest of the day she stated ("quero estudar política", "não quero idiomas", "quero descansar"). */
  interest?: string
}

/** One thing that could be done in a free slot. Producers must not invent facts. */
export interface Candidate {
  /** Stable: `${source}:${id}` (e.g. 'task:abc', 'study:english-review'). */
  key: string
  title: string
  area: LifeArea
  /** Estimated minutes (min, max allowed by the producer). */
  minMin: number
  maxMin: number
  /** Energy needed to do it well (1–5). */
  energyNeed: Energy
  moscow: MoSCoW
  /** 0–100 inside its MoSCoW band; higher = more relevant now. */
  score: number
  /** Human, verifiable reasons (pt-BR), shown as the "porquê". */
  reasons: string[]
  /** Concrete next step (pt-BR). */
  nextStep?: string
  /** Objectives it also helps (ids or labels), for "combinação de objetivos". */
  contributesTo?: string[]
  /** Essential = never dropped by ranking (Luna, sleep, meals, minimum routines). */
  essential?: boolean
  deadline?: DateKey
  /** What it is about, for the timeline label ("Inglês", "IA", "Fashion Finder"). */
  subject?: string
  /** Study candidates: the Learning domain/track a finished block is recorded in (one StudySession). */
  study?: { domain: string; trackId?: string }
  /** What to open/do when she taps "Começar agora". */
  open?: { kind: 'task' | 'study' | 'route' | 'routine'; id?: ID; to?: string }
}
