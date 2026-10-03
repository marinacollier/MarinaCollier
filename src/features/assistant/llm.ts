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

// ─── "Ajustar por conversa" ─────────────────────────────────────────────────
//
// Today ./adjust/planner.ts turns pt-BR sentences into a ChangePlan with rules. A future
// server-side model (same flag, same rules: minimal context, never the whole DB) MUST output the
// very same ChangePlan JSON, validated against CHANGE_PLAN_SCHEMA. The client then recomputes
// consequences/warnings with the local engines (data/fuel.ts, data/planning.ts) — never trusting the
// model for them — and runs the identical preview → Confirmar → Desfazer flow (./adjust/apply.ts).
// 'remove' is never a delete: it is applied as status 'pulado'.

export type { ChangePlan, PlanChange, PlanChoiceOption, WorkoutDraft } from './adjust/types'

const WORKOUT_DRAFT_SCHEMA = {
  type: 'object',
  required: ['id', 'date', 'modality', 'status', 'order'],
  properties: {
    id: { type: 'string' },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    time: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
    period: { enum: ['manha', 'almoco', 'tarde', 'noite'] },
    modality: { type: 'string', description: 'Modality.id from profile.modalities' },
    status: { enum: ['planejado', 'feito', 'adaptado', 'descanso', 'pulado'] },
    title: { type: 'string' },
    plannedDurationMin: { type: 'number' },
    loadCategory: { enum: ['key', 'moderada', 'leve', 'descanso'] },
    isKeySession: { type: 'boolean' },
    isLongSession: { type: 'boolean' },
    requiresPreviousDayPrep: { type: 'boolean' },
    templateId: { type: 'string' },
    order: { type: 'number' },
  },
  additionalProperties: true,
} as const

/** JSON schema of a ChangePlan (the contract for any future generative planner). */
export const CHANGE_PLAN_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'ChangePlan',
  type: 'object',
  required: ['summary', 'changes', 'consequences', 'warnings'],
  properties: {
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'collection', 'after'],
        properties: {
          kind: { enum: ['create', 'update', 'remove'] },
          collection: { const: 'workouts' },
          id: { type: 'string' },
          before: { type: 'object' },
          after: WORKOUT_DRAFT_SCHEMA,
          sources: { type: 'array', items: { type: 'string' } },
          implicit: { type: 'boolean' },
        },
      },
    },
    consequences: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'object' } },
    needsChoice: {
      type: 'object',
      required: ['question', 'options'],
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'object', required: ['label', 'plan'], properties: { label: { type: 'string' }, plan: { $ref: '#' } } } },
      },
    },
    offerStrategy: { type: 'boolean' },
  },
} as const

export const ADJUST_PILL = 'Mari entende frases comuns e sempre mostra antes de mudar.'
