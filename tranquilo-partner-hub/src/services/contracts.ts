import type {
  EventId,
  EventPrepState,
  EventRecord,
  EventStage,
  MarketingTemplate,
  Partner,
  PartnerId,
  Playbook,
  Plaza,
  PlazaId,
  PrepTask,
  SalesSnapshot,
  ServiceResult,
  TaskId,
  TaskStatus,
} from '../types';

export interface AuthSession {
  subjectId: string;
  partnerIds: PartnerId[];
  activePlazaIds: PlazaId[];
  issuedAt: string;
  expiresAt: string;
}

export type HubPermission =
  | 'plaza.read'
  | 'event.read'
  | 'event.update'
  | 'task.update'
  | 'knowledge.read'
  | 'marketing.read'
  | 'sales.read';

export interface AccessScope {
  plazaId?: PlazaId;
  eventId?: EventId;
}

/** Interfaces apenas: nenhuma sessão demo, credencial ou política default é implementada. */
export interface AuthService {
  getSession(): Promise<ServiceResult<AuthSession | null>>;
}

export interface AuthorizationService {
  canAccess(permission: HubPermission, scope: AccessScope): Promise<ServiceResult<boolean>>;
}

export interface KnowledgeQuery {
  plazaId?: PlazaId;
  topic?: string;
  role?: string;
  eventStage?: EventStage;
  search?: string;
}

export interface KnowledgeService {
  list(query?: KnowledgeQuery): Promise<ServiceResult<Playbook[]>>;
  getById(id: string, scope?: AccessScope): Promise<ServiceResult<Playbook | null>>;
}

export interface EventQuery {
  plazaId?: PlazaId;
  status?: string;
}

export interface EventService {
  list(query?: EventQuery): Promise<ServiceResult<EventRecord[]>>;
  getById(id: EventId, scope?: AccessScope): Promise<ServiceResult<EventRecord | null>>;
  saveDraft(event: EventRecord): Promise<ServiceResult<EventRecord>>;
}

export interface EventPreparationService {
  getByEventId(eventId: EventId, scope?: AccessScope): Promise<ServiceResult<EventPrepState>>;
  save(eventId: EventId, state: EventPrepState): Promise<ServiceResult<EventPrepState>>;
}

export interface TaskService {
  listByEvent(eventId: EventId, scope?: AccessScope): Promise<ServiceResult<PrepTask[]>>;
  updateStatus(eventId: EventId, taskId: TaskId, status: TaskStatus): Promise<ServiceResult<PrepTask>>;
}

export interface MarketingService {
  listTemplates(query?: { channel?: MarketingTemplate['channel']; search?: string }): Promise<ServiceResult<MarketingTemplate[]>>;
  getTemplateById(id: string): Promise<ServiceResult<MarketingTemplate | null>>;
}

export interface SalesService {
  getSnapshot(plazaId: PlazaId): Promise<ServiceResult<SalesSnapshot>>;
}

export interface DirectoryService {
  listPlazas(): Promise<ServiceResult<Plaza[]>>;
  listPartners(query?: { plazaId?: PlazaId }): Promise<ServiceResult<Partner[]>>;
}

export interface PartnerHubServices {
  auth: AuthService;
  authorization: AuthorizationService;
  knowledge: KnowledgeService;
  events: EventService;
  preparation: EventPreparationService;
  tasks: TaskService;
  marketing: MarketingService;
  sales: SalesService;
  directory: DirectoryService;
}
