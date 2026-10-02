/**
 * Wire types returned by the Edge Functions. They mirror src/integrations/types.ts
 * (RemoteEvent, RemoteCalendar, RemoteActionCandidate, RemoteAccount, RemoteCategory,
 * RemoteTransaction). A compile-time test in src/integrations/server-mappers.test.ts keeps
 * them assignable to the app's types.
 */

export interface WireCalendar {
  externalId: string
  name: string
  color?: string
  primary?: boolean
}

export interface WireEvent {
  externalId: string
  globalId?: string
  title: string
  /** 'YYYY-MM-DD' in America/Sao_Paulo. */
  date: string
  startTime?: string
  endTime?: string
  endDate?: string
  allDay: boolean
  location?: string
  url?: string
  updatedAt?: string
  deleted?: boolean
}

export type WorkInboxKind =
  | 'responder'
  | 'pedido'
  | 'aprovacao'
  | 'deadline'
  | 'documento'
  | 'compromisso'
  | 'follow_up'
  | 'mencao'
  | 'decisao'
  | 'action_item'

/** Metadata only — there is deliberately no body field. */
export interface WireActionCandidate {
  externalId: string
  source: 'outlook' | 'teams'
  subject: string
  sender?: string
  receivedAt: string
  webUrl?: string
  suggestedKind?: WorkInboxKind
}

export interface WireAccount {
  externalId: string
  name: string
  kind: 'conta' | 'cartao' | 'investimento' | 'outro'
  balanceCents?: number
  closingDay?: number
  dueDay?: number
}

export interface WireCategory {
  externalId: string
  name: string
}

export interface WireTransaction {
  externalId: string
  description: string
  amountCents: number
  date: string
  paid: boolean
  categoryExternalId?: string
  accountExternalId?: string
  updatedAt?: string
}
