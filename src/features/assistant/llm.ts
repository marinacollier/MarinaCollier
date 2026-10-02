/**
 * Where generative answers would plug in — not active.
 *
 * Today Mari is 100% deterministic (./chief.ts + ./agents): she parses the question with rules and
 * reads the local DB. A generative provider would run SERVER-SIDE ONLY (API keys never reach the
 * browser), behind `profile.featureFlags.aiAssistantEnabled` (default off), and would receive a
 * minimal, already-filtered context built by the agents — never the whole DB, never corporate
 * message bodies. Its answer would be rendered with the same AnswerBlock types, so the UI does not change.
 *
 * Until a backend provider exists, the UI shows an honest pill instead of pretending.
 */
import type { DB } from '@/data/types'
import type { AnswerBlock, ParsedQuestion } from './types'

export interface LLMContext {
  question: ParsedQuestion
  /** Deterministic blocks the agents already produced; the model may only rephrase/summarize them. */
  facts: AnswerBlock[]
  locale: 'pt-BR'
}

export interface LLMProvider {
  id: string
  /** True only when the backend is configured and the feature flag is on. */
  isAvailable(db: DB): boolean
  answer(ctx: LLMContext, signal?: AbortSignal): Promise<{ headline: string; blocks: AnswerBlock[] }>
}

/** No provider is registered in the client. Kept explicit so nobody fakes one. */
export const llmProvider: LLMProvider | null = null

export function generativeEnabled(db: DB): boolean {
  return !!db.profile.featureFlags.aiAssistantEnabled && !!llmProvider?.isAvailable(db)
}

export const GENERATIVE_PILL = 'IA generativa: em breve — por enquanto eu cruzo seus dados com regras'
