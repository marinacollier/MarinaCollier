/**
 * Integration layer contracts. React components never talk to providers directly:
 * they call functions from src/integrations/* which return plain data and write to the store.
 *
 * Security model (see docs/INTEGRATIONS.md):
 * - OAuth tokens and API keys NEVER live in the browser (no localStorage/IndexedDB).
 * - Providers that need secrets go through a backend (Supabase Edge Functions) configured by
 *   VITE_MARINA_API_URL. When it is missing, the provider reports status 'needs_config'.
 * - Corporate data (Outlook/Teams) is minimized: metadata + authorized summary + external refs.
 */
import type { DateKey, FeatureFlags, IntegrationStatus, ISODateTime, ProviderId, Recurrence, TimeHM } from '@/data/types'

export type ProviderKind = 'calendar' | 'mail' | 'messaging' | 'finance' | 'health' | 'tasks'

export interface ProviderInfo {
  id: ProviderId
  name: string
  kind: ProviderKind
  /** Feature flag gating this provider (profile.featureFlags). */
  flag?: keyof FeatureFlags
  /** Needs the backend (secrets / OAuth code exchange). */
  requiresBackend: boolean
  /** Official documentation the implementation follows. */
  docsUrl?: string
  /** Short honest description shown in the integrations screen. */
  description: string
  /** Group on the integrations screen. */
  group: 'calendarios' | 'trabalho' | 'financas' | 'apple'
  /** 'built' = adapter + backend function written; 'planned' = nothing to connect yet. */
  maturity: 'built' | 'planned'
  /** What MARINA OS keeps locally (privacy). */
  stores: string[]
  /** Exactly what is requested from the provider (OAuth scopes / credentials). */
  permissions: string[]
  /** Hard guarantees shown to Marina (e.g. read-only). */
  guarantees?: string[]
}

export interface ProviderStatus {
  status: IntegrationStatus
  /** Human message, pt-BR. */
  message: string
}

// ─── Calendar ───────────────────────────────────────────────────────────────

export interface RemoteCalendar {
  externalId: string
  name: string
  color?: string
  primary?: boolean
}

export interface RemoteEvent {
  externalId: string
  /** iCalUID when available — used to dedupe the same meeting coming from Google, Outlook and Toki. */
  globalId?: string
  title: string
  date: DateKey
  startTime?: TimeHM
  endTime?: TimeHM
  endDate?: DateKey
  allDay: boolean
  location?: string
  url?: string
  updatedAt?: ISODateTime
  /** Provider says the event was cancelled/deleted. */
  deleted?: boolean
  /** Only when the source rule maps exactly onto our Recurrence (ICS import). Providers expand instances instead. */
  recurrence?: Recurrence
}

export interface CalendarProvider {
  info: ProviderInfo
  status(): Promise<ProviderStatus>
  /** Starts OAuth (redirect) — only when status is 'needs_auth'. */
  connect?(): Promise<void>
  listCalendars(): Promise<RemoteCalendar[]>
  listEvents(calendarId: string, range: { from: DateKey; to: DateKey }): Promise<RemoteEvent[]>
}

// ─── Mail / messaging (read-only by default) ────────────────────────────────

/** Metadata-only candidate for the Work Inbox. No message bodies. */
export interface RemoteActionCandidate {
  externalId: string
  source: 'outlook' | 'teams'
  subject: string
  sender?: string
  receivedAt: ISODateTime
  webUrl?: string
  /** Heuristic classification; Marina decides what becomes a task. */
  suggestedKind?: import('@/data/types').WorkInboxKind
  /** Only when the user authorized summaries. */
  summary?: string
}

export interface MailProvider {
  info: ProviderInfo
  status(): Promise<ProviderStatus>
  connect?(): Promise<void>
  listActionCandidates(since: ISODateTime): Promise<RemoteActionCandidate[]>
}

export type MessagingProvider = MailProvider

// ─── Finance ────────────────────────────────────────────────────────────────

export interface RemoteAccount {
  externalId: string
  name: string
  kind: 'conta' | 'cartao' | 'investimento' | 'outro'
  balanceCents?: number
  closingDay?: number
  dueDay?: number
}

export interface RemoteCategory {
  externalId: string
  name: string
}

export interface RemoteTransaction {
  externalId: string
  description: string
  /** Negative = expense, positive = income. */
  amountCents: number
  date: DateKey
  paid: boolean
  categoryExternalId?: string
  accountExternalId?: string
  updatedAt?: ISODateTime
}

export interface FinanceProvider {
  info: ProviderInfo
  status(): Promise<ProviderStatus>
  connect?(): Promise<void>
  listAccounts(): Promise<RemoteAccount[]>
  listCategories(): Promise<RemoteCategory[]>
  listTransactions(range: { from: DateKey; to: DateKey }): Promise<RemoteTransaction[]>
}

// ─── Sync ───────────────────────────────────────────────────────────────────

export interface SyncReport {
  created: number
  updated: number
  deleted: number
  unchanged: number
  /** Records needing Marina's decision (e.g. possible duplicate expense). Never resolved silently. */
  conflicts: number
}

export const EMPTY_REPORT: SyncReport = { created: 0, updated: 0, deleted: 0, unchanged: 0, conflicts: 0 }
