export type PlazaId = string;
export type EventId = string;
export type PartnerId = string;
export type TaskId = string;
export type PlaybookId = string;

export type EventStage = 'context' | 'operations' | 'promotion' | 'review' | 'event-day' | 'post-event';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'done';
export type KnowledgeVisibility = 'global' | 'plaza';

export interface Plaza {
  id: PlazaId;
  name: string;
  shortName: string;
  accent: string;
  isDemo: boolean;
}

/** Papel/parceiro operacional. Não representa conta, login nem usuário autenticado. */
export interface Partner {
  id: PartnerId;
  displayName: string;
  role: string;
  plazaIds: PlazaId[];
  isDemo: boolean;
}

/** Registro de evento com relações explícitas; `city` descreve o local editável do evento. */
export interface EventRecord {
  id: EventId;
  plazaId: PlazaId;
  partnerIds: PartnerId[];
  title: string;
  date: string;
  venue: string;
  format: string;
  status: string;
  city: string;
}

export interface DemoEvent extends EventRecord {
  isDemo: true;
}

export interface PrepTask {
  id: TaskId;
  eventId: EventId;
  plazaId: PlazaId;
  responsiblePartnerIds: PartnerId[];
  title: string;
  owner: string;
  dueLabel: string;
  group: 'Produção' | 'Marketing' | 'Operação';
  status: TaskStatus;
  resource?: PlaybookId;
  isDemo: true;
}

export interface KnowledgeScope {
  visibility: KnowledgeVisibility;
  plazaIds: PlazaId[];
}

export interface Playbook {
  id: PlaybookId;
  title: string;
  description: string;
  category: 'Produção' | 'Marketing' | 'Vendas';
  topic: string;
  owner: string;
  ownerPartnerIds: PartnerId[];
  scope: KnowledgeScope;
  eventStage: EventStage;
  duration: string;
  steps: string[];
  material: string;
  version: string;
  updatedAt: string;
  isDemo: true;
}

export interface MarketingTemplate {
  id: string;
  title: string;
  channel: 'Stories' | 'Feed' | 'WhatsApp' | 'Kit oficial';
  format: string;
  description: string;
  accent: string;
  copy: string;
  resourceUrl: string;
  resourceLabel: string;
  official?: boolean;
}

export interface SalesMetric {
  id: string;
  label: string;
  value: number | null;
  weight: number;
  note: string;
}

export type SalesImportStatus = 'demo' | 'not_imported' | 'loading' | 'success' | 'partial' | 'error';

/** Envelope de ingestão preparada para explicitar proveniência e dados incompletos. */
export interface SalesSnapshot {
  plazaId: PlazaId;
  source: { kind: 'demo' | 'system' | 'unknown'; label: string };
  updatedAt: string | null;
  importStatus: SalesImportStatus;
  missingFields: string[];
  score: number | null;
  band: string;
  updatedLabel: string;
  metrics: SalesMetric[];
  trend: number[];
}

export interface EventPrepState {
  eventId: EventId;
  plazaId: PlazaId;
  city: string;
  title: string;
  date: string;
  venue: string;
  format: string;
  objective: string;
  audience: string;
  channels: string[];
  notes: string;
  checkedTaskIds: TaskId[];
  activeStep: number;
}

export interface DemoArtist {
  id: string;
  displayName: string;
  isDemo: true;
}

export interface DemoCampaign {
  id: string;
  title: string;
  templateIds: string[];
  isDemo: true;
}

export type BriefingStatus = 'draft' | 'in_review' | 'approved_demo';

export interface BriefingDraft {
  plazaId: PlazaId;
  eventId: EventId;
  artistId: string;
  campaignId: string;
  eventName: string;
  city: string;
  venue: string;
  format: string;
  date: string;
  objective: string;
  audience: string;
  channel: string;
  keyMessage: string;
  callToAction: string;
  tone: string;
}

export interface SavedBriefing {
  id: string;
  createdAt: string;
  draft: BriefingDraft;
  content: string;
  status: BriefingStatus;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; data: T; message: string };
