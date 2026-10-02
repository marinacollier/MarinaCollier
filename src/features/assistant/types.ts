import type { DateKey, DB, Project, Trip } from '@/data/types'
import type { ResultAction } from '@/features/search/actions'

export interface AnswerItem {
  id: string
  emoji?: string
  title: string
  subtitle?: string
  trailing?: string
  action?: ResultAction
}

export type AnswerBlock =
  /** One-line answer. The chief keeps the first agent's headline as the answer's headline. */
  | { kind: 'headline'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'stat'; label: string; value: string; hint?: string; action?: ResultAction }
  | { kind: 'list'; title: string; emoji?: string; items: AnswerItem[]; more?: { label: string; action: ResultAction } }
  | { kind: 'suggestions'; title?: string; questions: string[] }

export type TimeWord = 'hoje' | 'amanha' | 'semana' | 'mes'

/** The question after pt-BR keyword parsing + entity resolution. */
export interface ParsedQuestion {
  raw: string
  /** normalized (lowercase, no accents). */
  norm: string
  tokens: string[]
  time?: TimeWord
  /** 0-11 when a month name was mentioned. */
  month?: number
  projects: Project[]
  trips: Trip[]
  /** Modality ids ("musculacao", "bike"...). */
  modalities: string[]
}

export interface AgentContext {
  db: DB
  today: DateKey
  /** Minutes since midnight in São Paulo. */
  minutes: number
  q: ParsedQuestion
}

export interface Agent {
  id: string
  name: string
  emoji: string
  /** 0..1 — how well this agent can answer. */
  match(q: ParsedQuestion): number
  answer(ctx: AgentContext): AnswerBlock[]
}

export interface MariAnswer {
  question: string
  headline: string
  blocks: AnswerBlock[]
  agents: { id: string; name: string; emoji: string }[]
  fallback: boolean
}
