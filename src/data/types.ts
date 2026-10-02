/**
 * MARINA OS — shared data contracts.
 *
 * This file is the single source of truth for every entity in the app.
 * Feature modules MUST import types from here and MUST NOT redefine entities locally.
 *
 * Conventions
 * - Every persisted record extends `Entity` (id + timestamps).
 * - Calendar days are `DateKey` strings ('YYYY-MM-DD') in America/Sao_Paulo. Never store a Date object.
 * - Times of day are `TimeHM` strings ('HH:mm').
 * - Money is always integer cents (`amountCents`) in BRL.
 * - Recurring things store a rule (`Recurrence`); completions live in `occurrences`
 *   so checking "água — hoje" never mutates tomorrow's routine.
 * - Anything that came from an external system carries `external: ExternalRef`.
 * - Generic entities are preferred over near-duplicates. Several names from the product brief
 *   are type aliases at the bottom of this file (e.g. `WaitingFor` is a `Task` with status 'waiting').
 */

export type ID = string
/** 'YYYY-MM-DD' in America/Sao_Paulo. */
export type DateKey = string
/** 'HH:mm', 24h. */
export type TimeHM = string
/** Full ISO-8601 timestamp, e.g. new Date().toISOString(). */
export type ISODateTime = string
/** 0 = domingo ... 6 = sábado (same as Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Entity {
  id: ID
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Link {
  label: string
  url: string
}

export interface Person {
  name: string
  role?: string
  contact?: string
}

export interface LogEntry {
  date: DateKey
  text: string
}

// ─── Integrations / sync ────────────────────────────────────────────────────

export type ProviderId =
  | 'local'
  | 'google'
  | 'microsoft' // Microsoft 365 calendar (Graph)
  | 'outlook' // Microsoft 365 mail (Graph)
  | 'teams'
  | 'ics'
  | 'organizze'
  | 'toki'
  | 'apple'

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'deleted_remotely' | 'error'

/** Attached to any record mirrored from / to an external provider. Dedup key = provider + externalId. */
export interface ExternalRef {
  provider: ProviderId
  externalId: string
  accountId?: string
  /** Cross-provider identity when available (iCalUID for calendar events). Used to avoid Toki/Google/Outlook duplicates. */
  globalId?: string
  lastSyncedAt?: ISODateTime
  syncStatus: SyncStatus
  /** Hash of the remote payload fields we mirror; changes => remote updated. */
  syncHash?: string
  webUrl?: string
}

export type IntegrationStatus =
  | 'coming_soon' // Disponível em breve
  | 'needs_config' // Configuração necessária (backend/env not set)
  | 'needs_auth' // Backend ok, user must sign in
  | 'connected'
  | 'error'
  | 'policy_blocked' // Integração indisponível pela política da organização

/** One row per provider. Never holds tokens — tokens live server-side only. */
export interface IntegrationConnection extends Entity {
  provider: ProviderId
  status: IntegrationStatus
  accountLabel?: string
  scopes: string[]
  lastSyncAt?: ISODateTime
  error?: string
}

// ─── Shared enums ───────────────────────────────────────────────────────────

/** Life areas used by goals, tasks and reviews. */
export type Area = 'pessoal' | 'corpo' | 'profissional' | 'estudo' | 'financeiro' | 'viagem' | 'conteudo'

export type Priority = 'alta' | 'media' | 'baixa'

/** Where a task lives in Marina's head. */
export type Bucket = 'hoje' | 'semana' | 'algum_dia'

export type LifeAdminCategory =
  | 'casa'
  | 'carro'
  | 'bike'
  | 'documentos'
  | 'manutencao'
  | 'compras'
  | 'assinaturas'
  | 'burocracia'
  | 'consultas'
  | 'outros'

// ─── Recurrence ─────────────────────────────────────────────────────────────

export type Recurrence =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekdays: Weekday[] }
  /** dayOfMonth 1..31 (clamped to month length) or 'last'. */
  | { kind: 'monthly'; dayOfMonth: number | 'last' }
  /** Every N days counted from `anchor` (or from the last completion when `fromLastDone`). */
  | { kind: 'every_n_days'; days: number; anchor: DateKey; fromLastDone?: boolean }

export type OccurrenceParent = 'task' | 'routineItem' | 'petTask'

/** A single dated completion (or skip) of something recurring. Also used as TaskOccurrence / RoutineOccurrence. */
export interface Occurrence extends Entity {
  parentType: OccurrenceParent
  parentId: ID
  date: DateKey
  status: 'done' | 'skipped'
  note?: string
}

// ─── Profile & customization ────────────────────────────────────────────────

export type ModuleId =
  | 'hoje'
  | 'agenda'
  | 'vida'
  | 'trabalho'
  | 'corpo'
  | 'dinheiro'
  | 'metas'
  | 'estudos'
  | 'livros'
  | 'viagens'
  | 'creator'
  | 'luna'
  | 'vida_real'
  | 'inbox'
  | 'revisao'
  | 'mes'
  | 'mari'

export type HomeWidgetId =
  | 'agora'
  | 'top3'
  | 'manha'
  | 'proximo_compromisso'
  | 'treino'
  | 'refeicoes'
  | 'gastos'
  | 'tarefas'
  | 'proxima_viagem'
  | 'lendo_agora'
  | 'estudo_atual'
  | 'waiting_for'
  | 'work_focus'
  | 'luna'
  | 'countdown'
  | 'fechamento'

export interface Modality {
  id: string
  label: string
  emoji: string
  /** Token name from the design system: 'accent' | 'sage' | 'ocean' | 'sand' | 'plum' | 'ink'. */
  tone: Tone
  favorite: boolean
  active: boolean
  /** Distance is meaningful for this modality (corrida, bike...). */
  hasDistance: boolean
}

export type Tone = 'accent' | 'sage' | 'ocean' | 'sand' | 'plum' | 'ink'

export type NotificationCategory =
  | 'compromisso'
  | 'deadline'
  | 'treino'
  | 'rotina'
  | 'viagem'
  | 'waiting_for'
  | 'revisao_semanal'

export interface NotificationPref {
  category: NotificationCategory
  enabled: boolean
  /** Minutes before the moment (where it applies). */
  leadMinutes?: number
}

export interface FeatureFlags {
  googleCalendarEnabled: boolean
  microsoftCalendarEnabled: boolean
  teamsEnabled: boolean
  outlookMailEnabled: boolean
  organizzeEnabled: boolean
  icsEnabled: boolean
  aiAssistantEnabled: boolean
}

export type ThemePref = 'light' | 'dark' | 'system'

export interface UserProfile {
  name: string
  timezone: 'America/Sao_Paulo'
  theme: ThemePref
  /** Ordered. Widgets not listed or with visible=false are hidden on Hoje. */
  homeWidgets: { id: HomeWidgetId; visible: boolean }[]
  /** Modules that can be hidden from Mais / Vida / search. */
  modules: { id: ModuleId; visible: boolean }[]
  modalities: Modality[]
  notificationPrefs: NotificationPref[]
  featureFlags: FeatureFlags
  waterGoal: number
  /** Set when Marina taps "Entrar no meu dia" on first run. */
  onboardedAt?: ISODateTime
  /** Optional overrides of the time-of-day boundaries used by the contextual home (hours, 0-23). */
  dayParts: { morningStart: number; middayStart: number; eveningStart: number }
}

// ─── Today / tasks / routines ───────────────────────────────────────────────

export type TaskStatus =
  | 'todo'
  | 'doing'
  | 'waiting' // Waiting For: depends on someone else
  | 'review' // "revisar / confirmar" — situation not proven yet
  | 'done'
  | 'archived'

/** Generic action item. Also used for ProjectTask, WaitingFor and LifeAdminItem (see aliases). */
export interface Task extends Entity {
  title: string
  notes?: string
  status: TaskStatus
  /** Day it is planned for (shows on Hoje / Agenda that day). */
  date?: DateKey
  time?: TimeHM
  durationMin?: number
  /** Hard deadline. */
  dueDate?: DateKey
  bucket?: Bucket
  area?: Area
  priority?: Priority
  /** Free-form grouping label (e.g. 'Cape Town', 'Johannesburg / Safari'). */
  group?: string
  /** 'trabalho' tasks show in Work OS, 'vida_real' in Vida real, 'luna' in Luna, etc. */
  context?: 'geral' | 'trabalho' | 'vida_real' | 'luna' | 'viagem' | 'conteudo' | 'estudo'
  lifeAdminCategory?: LifeAdminCategory
  projectId?: ID
  tripId?: ID
  partnershipId?: ID
  /** Waiting For details when status === 'waiting'. */
  waiting?: { who: string; since: DateKey; followUpOn?: DateKey }
  /** Work: blocked until Marina acts ("Precisa de mim"). */
  needsMe?: boolean
  /** If set, the task is a recurring template; completions are Occurrences. */
  recurrence?: Recurrence
  /** Where it came from (brain dump, work inbox...). */
  origin?: { type: EntityType; id: ID }
  completedAt?: ISODateTime
  order: number
}

/** "Minhas 3 prioridades de hoje". Max 3 per date. Can point at any entity. */
export interface DayPriority extends Entity {
  date: DateKey
  title: string
  order: number
  done: boolean
  ref?: { type: EntityType; id: ID }
}

export type RoutinePeriod = 'manha' | 'dia' | 'noite' | 'trabalho'

export interface Routine extends Entity {
  name: string
  period: RoutinePeriod
  emoji?: string
  order: number
  active: boolean
}

export interface RoutineItem extends Entity {
  routineId: ID
  title: string
  emoji?: string
  /** Usually { kind: 'weekly', weekdays: [...] } — "quais itens aparecem em cada dia". */
  recurrence: Recurrence
  order: number
  active: boolean
}

// ─── Calendar ───────────────────────────────────────────────────────────────

export interface CalendarSource extends Entity {
  provider: ProviderId
  name: string
  externalAccountId?: string
  calendarId?: string
  syncDirection: 'none' | 'read' | 'write' | 'two_way'
  lastSync?: ISODateTime
  /** CSS color or tone token. */
  color: string
  enabled: boolean
  /** For ICS subscriptions. */
  icsUrl?: string
}

export interface CalendarEvent extends Entity {
  sourceId: ID
  title: string
  /** Day of the start in America/Sao_Paulo (denormalized for fast lookups). */
  date: DateKey
  /** Omitted for all-day events. */
  startTime?: TimeHM
  endTime?: TimeHM
  /** Multi-day / all-day end (inclusive). */
  endDate?: DateKey
  allDay: boolean
  location?: string
  notes?: string
  url?: string
  kind?: 'pessoal' | 'trabalho' | 'treino' | 'viagem' | 'saude' | 'luna' | 'outro'
  projectId?: ID
  tripId?: ID
  recurrence?: Recurrence
  external?: ExternalRef
}

// ─── Body ───────────────────────────────────────────────────────────────────

export type WorkoutStatus = 'planejado' | 'feito' | 'adaptado' | 'descanso' | 'pulado'

export interface Workout extends Entity {
  date: DateKey
  time?: TimeHM
  /** Modality.id from profile.modalities. */
  modality: string
  status: WorkoutStatus
  title?: string
  plannedDurationMin?: number
  durationMin?: number
  plannedDistanceKm?: number
  distanceKm?: number
  goal?: string
  intensity?: 'leve' | 'moderado' | 'forte'
  notes?: string
  /** 1 (pesado) .. 5 (incrível). */
  feeling?: 1 | 2 | 3 | 4 | 5
  workoutGoalId?: ID
  order: number
  external?: ExternalRef
}

export interface Milestone {
  id: ID
  title: string
  date?: DateKey
  done: boolean
}

export interface WorkoutGoal extends Entity {
  title: string
  kind: 'sessions' | 'distance' | 'event' | 'habit'
  modality?: string
  /** For sessions/distance goals: counted automatically from workouts between startDate and deadline. */
  target?: number
  unit?: 'sessoes' | 'km'
  startDate: DateKey
  deadline?: DateKey
  preparation?: string
  milestones: Milestone[]
  notes?: string
  status: 'ativa' | 'concluida' | 'pausada'
  tripId?: ID
}

export type MealSlot = 'cafe' | 'lanche_manha' | 'almoco' | 'lanche_tarde' | 'jantar' | 'extra'
export type FoodTag = 'proteina' | 'fruta' | 'vegetais'

export interface Meal extends Entity {
  date: DateKey
  slot: MealSlot
  description: string
  done: boolean
  planned?: boolean
  tags: FoodTag[]
  templateId?: ID
  time?: TimeHM
}

/** Favorite meals for one-tap logging. */
export interface MealTemplate extends Entity {
  name: string
  description: string
  slot?: MealSlot
  tags: FoodTag[]
  order: number
}

/** One per day (id is free, `date` is unique). Holds check-in, simple habits and the daily closing. */
export interface DailyCheckIn extends Entity {
  date: DateKey
  energia?: 'baixa' | 'media' | 'alta'
  sono?: 'ruim' | 'ok' | 'bom'
  corpo?: 'cansado' | 'normal' | 'forte'
  humor?: 1 | 2 | 3 | 4 | 5
  nota?: string
  habits: {
    agua: number
    proteina: boolean
    fruta: boolean
    vegetais: boolean
    refeicoesPlanejadas: boolean
  }
  closing?: {
    mood: 'bom' | 'neutro' | 'cansado'
    closedAt: ISODateTime
    winText?: string
  }
}

// ─── Money ──────────────────────────────────────────────────────────────────

export type PaymentMethod = 'credito' | 'debito' | 'pix' | 'dinheiro' | 'boleto' | 'vale'

export interface Expense extends Entity {
  title: string
  amountCents: number
  /** Purchase day. Optional only for planned purchases not bought yet. */
  date?: DateKey
  /** FinancialCategory.id */
  categoryId: ID
  payment?: PaymentMethod
  /** planejada / não planejada (awareness, never judgement). */
  planned?: boolean
  /** 'planned_purchase' = Compras planejadas / lista de compras (not spent yet). */
  status: 'paid' | 'planned_purchase'
  notes?: string
  tripId?: ID
  accountId?: ID
  origin: 'manual' | 'organizze'
  external?: ExternalRef
  /** Set by duplicate detection when an imported transaction looks like a manual one. Marina decides. */
  possibleDuplicateOf?: ID
}

export interface FinancialAccount extends Entity {
  name: string
  kind: 'conta' | 'cartao' | 'investimento' | 'outro'
  balanceCents?: number
  closingDay?: number
  dueDay?: number
  external?: ExternalRef
  archived: boolean
}

export interface FinancialCategory extends Entity {
  name: string
  emoji: string
  tone: Tone
  /** Monthly budget, optional. */
  budgetCents?: number
  order: number
  archived: boolean
  external?: ExternalRef
}

// ─── Goals ──────────────────────────────────────────────────────────────────

export type GoalLevel = 'dia' | 'semana' | 'maior'

/** Meta de hoje / da semana / maior. Also WeeklyGoal and LongTermGoal. */
export interface Goal extends Entity {
  level: GoalLevel
  title: string
  category: Area
  /** 'dia': the date. 'semana': the Monday (weekStart). 'maior': unused. */
  period?: DateKey
  deadline?: DateKey
  /** Big = one of the (max 3) main goals for its period. */
  big: boolean
  status: 'ativa' | 'feita' | 'pausada' | 'solta'
  /** 0..100, manual. */
  progress?: number
  notes?: string
  parentId?: ID
  order: number
}

// ─── Work ───────────────────────────────────────────────────────────────────

export type ProjectStatus = 'ativo' | 'planejando' | 'pausado' | 'concluido'

export interface Project extends Entity {
  name: string
  role?: string
  emoji: string
  tone: Tone
  status: ProjectStatus
  priority: Priority
  description?: string
  objective?: string
  deadline?: DateKey
  nextDelivery?: { title: string; date?: DateKey }
  nextAction?: string
  links: Link[]
  files: Link[]
  people: Person[]
  notes?: string
  decisions: LogEntry[]
  changelog: LogEntry[]
  /** 'creator' marks the UGC/Content front, which gets the Creator OS view. */
  kind: 'default' | 'creator'
  order: number
}

export interface ProjectMilestone extends Entity {
  projectId: ID
  title: string
  date?: DateKey
  done: boolean
  order: number
}

export type WinKind =
  | 'entrega'
  | 'contrato'
  | 'reconhecimento'
  | 'projeto'
  | 'feedback'
  | 'resultado'
  | 'certificacao'
  | 'conquista'

export interface ProfessionalWin extends Entity {
  date: DateKey
  title: string
  kind: WinKind
  projectId?: ID
  description?: string
  impact?: string
  link?: string
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

/**
 * Work Inbox item (EmailAction). Possible action coming from Outlook, Teams, notes or projects.
 * Privacy: stores metadata + optional authorized summary, never full corporate message bodies.
 */
export interface WorkInboxItem extends Entity {
  source: 'outlook' | 'teams' | 'nota' | 'projeto' | 'manual'
  subject: string
  sender?: string
  receivedAt?: ISODateTime
  kind: WorkInboxKind
  summary?: string
  link?: string
  status: 'novo' | 'virou_tarefa' | 'waiting' | 'resolvido' | 'ignorado'
  taskId?: ID
  projectId?: ID
  dueDate?: DateKey
  external?: ExternalRef
}

export interface Meeting extends Entity {
  title: string
  date: DateKey
  startTime?: TimeHM
  endTime?: TimeHM
  projectId?: ID
  eventId?: ID
  notes?: string
  decisions: string[]
  actionItems: { text: string; taskId?: ID }[]
  links: Link[]
  external?: ExternalRef
}

// ─── Learning ───────────────────────────────────────────────────────────────

export interface StudyTrack extends Entity {
  name: string
  emoji: string
  tone: Tone
  order: number
  archived: boolean
}

export type StudyStatus = 'estudando' | 'proximo' | 'backlog' | 'pausado' | 'finalizado'

export interface StudyItem extends Entity {
  trackId?: ID
  title: string
  kind: 'curso' | 'aula' | 'artigo' | 'video' | 'livro' | 'tema' | 'certificacao' | 'podcast' | 'outro'
  source?: string
  link?: string
  status: StudyStatus
  progress: number
  nextContent?: string
  notes?: string
  order: number
  finishedAt?: DateKey
}

export type BookStatus = 'lendo' | 'proximo' | 'quero' | 'finalizado'

export interface Book extends Entity {
  title: string
  author?: string
  /** URL or data: URL. When missing, the UI renders a typographic cover. */
  coverUrl?: string
  category?: string
  status: BookStatus
  progress: number
  startDate?: DateKey
  endDate?: DateKey
  rating?: 1 | 2 | 3 | 4 | 5
  notes?: string
  quotes: { id: ID; text: string; page?: string }[]
  order: number
}

// ─── Travel ─────────────────────────────────────────────────────────────────

export interface Trip extends Entity {
  name: string
  flag: string
  place?: string
  startDate?: DateKey
  endDate?: DateKey
  /** Human label when dates are fuzzy ("out/nov 2026"). */
  dateLabel?: string
  datesConfirmed: boolean
  summary?: string
  interests: string[]
  companions?: string
  tone: Tone
  budgetCents?: number
  notes?: string
  emergencyInfo?: string
  links: Link[]
  status: 'sonhando' | 'planejando' | 'confirmada' | 'em_andamento' | 'concluida'
  order: number
}

export type TripSection =
  | 'voo'
  | 'hospedagem'
  | 'transporte'
  | 'reserva'
  | 'roteiro'
  | 'quero_ir'
  | 'comida'
  | 'esporte'
  | 'mala'
  | 'comprar'
  | 'documento'
  | 'antes_de_ir'

/** Generic trip item: TripReservation, TripActivity and TripPackingItem are aliases. */
export interface TripItem extends Entity {
  tripId: ID
  section: TripSection
  /** Sub-group inside a trip, e.g. 'Cape Town', 'Johannesburg / Safari', 'Equipment'. */
  group?: string
  title: string
  /** 'a_confirmar' is the default for anything not proven — never assume. */
  status: 'a_confirmar' | 'a_fazer' | 'confirmado' | 'feito' | 'cancelado'
  date?: DateKey
  time?: TimeHM
  notes?: string
  url?: string
  amountCents?: number
  confirmationCode?: string
  order: number
}

// ─── Content / UGC ──────────────────────────────────────────────────────────

export type ContentStage = 'ideia' | 'gravar' | 'editando' | 'pronto' | 'publicado'

/** ContentIdea (stage 'ideia') and ContentPiece (later stages) share this entity. */
export interface ContentItem extends Entity {
  title: string
  stage: ContentStage
  format?: string
  platform?: string
  category?: string
  hook?: string
  script?: string
  assets?: string
  cta?: string
  deadline?: DateKey
  publishedAt?: DateKey
  partnershipId?: ID
  links: Link[]
  order: number
}

export type PartnershipStage =
  | 'ideia'
  | 'contato'
  | 'negociacao'
  | 'fechado'
  | 'producao'
  | 'aguardando_aprovacao'
  | 'publicado'
  | 'aguardando_pagamento'
  | 'finalizado'

export interface BrandPartnership extends Entity {
  brand: string
  contact?: string
  format?: string
  briefing?: string
  deliverables?: string
  deadline?: DateKey
  valueCents?: number
  barter?: string
  coupon?: string
  affiliateLink?: string
  stage: PartnershipStage
  links: Link[]
  notes?: string
  order: number
}

// ─── Capture ────────────────────────────────────────────────────────────────

export interface Note extends Entity {
  title?: string
  body: string
  kind: 'nota' | 'ideia'
  tags: string[]
  pinned: boolean
  projectId?: ID
  tripId?: ID
}

export type BrainDumpTarget =
  | 'task'
  | 'idea'
  | 'purchase'
  | 'trip'
  | 'project'
  | 'study'
  | 'book'
  | 'content'
  | 'reminder'
  | 'waiting'
  | 'goal'
  | 'lifeAdmin'

/** Capture first, organize later. */
export interface BrainDumpItem extends Entity {
  text: string
  status: 'inbox' | 'processado' | 'arquivado'
  /** Optional seed/user grouping ('África do Sul', 'Projetos'...). Never required at capture. */
  group?: string
  convertedTo?: { type: EntityType; id: ID }
}

// ─── Luna / life admin ──────────────────────────────────────────────────────

export interface Pet extends Entity {
  name: string
  species: string
  breed?: string
  birthDate?: DateKey
  vet?: Person
  notes?: string
  documents: Link[]
}

export type PetTaskCategory =
  | 'alimentacao'
  | 'passeio'
  | 'creche'
  | 'banho'
  | 'veterinario'
  | 'medicacao'
  | 'compras'
  | 'lembrete'
  | 'documento'

export interface PetTask extends Entity {
  petId: ID
  title: string
  category: PetTaskCategory
  /** Recurring when set; completions are Occurrences (parentType 'petTask'). */
  recurrence?: Recurrence
  /** One-off due date when not recurring. */
  dueDate?: DateKey
  notes?: string
  active: boolean
  order: number
}

// ─── Reviews ────────────────────────────────────────────────────────────────

export interface WeeklyReview extends Entity {
  /** Monday of the reviewed week. */
  weekStart: DateKey
  answers: Partial<
    Record<
      'certo' | 'pendente' | 'gostei' | 'corpo' | 'dinheiro' | 'projeto' | 'evitando' | 'atencao',
      string
    >
  >
  nextPriorities: string[]
  completedAt?: ISODateTime
}

export interface MonthlyReview extends Entity {
  /** 'YYYY-MM' */
  month: string
  highlights: string[]
  notes?: string
  takeForward?: string
  completedAt?: ISODateTime
}

// ─── Database shape ─────────────────────────────────────────────────────────

export interface DB {
  schemaVersion: number
  profile: UserProfile

  tasks: Task[]
  occurrences: Occurrence[]
  priorities: DayPriority[]
  routines: Routine[]
  routineItems: RoutineItem[]

  calendarSources: CalendarSource[]
  events: CalendarEvent[]

  workouts: Workout[]
  workoutGoals: WorkoutGoal[]
  meals: Meal[]
  mealTemplates: MealTemplate[]
  checkins: DailyCheckIn[]

  expenses: Expense[]
  financialAccounts: FinancialAccount[]
  financialCategories: FinancialCategory[]

  goals: Goal[]

  projects: Project[]
  milestones: ProjectMilestone[]
  wins: ProfessionalWin[]
  workInbox: WorkInboxItem[]
  meetings: Meeting[]

  studyTracks: StudyTrack[]
  studyItems: StudyItem[]
  books: Book[]

  trips: Trip[]
  tripItems: TripItem[]

  contentItems: ContentItem[]
  partnerships: BrandPartnership[]

  notes: Note[]
  brainDump: BrainDumpItem[]

  pets: Pet[]
  petTasks: PetTask[]

  weeklyReviews: WeeklyReview[]
  monthlyReviews: MonthlyReview[]

  integrations: IntegrationConnection[]
}

/** Keys of DB that hold arrays of entities. */
export type CollectionKey = {
  [K in keyof DB]: DB[K] extends Entity[] ? K : never
}[keyof DB]

export type ItemOf<K extends CollectionKey> = DB[K][number]

/** Payload for creating an item: id/timestamps are generated by the store. */
export type NewItem<K extends CollectionKey> = Omit<ItemOf<K>, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: ID
}

/** Names used for cross-references (priority refs, brain dump conversions, search results). */
export type EntityType =
  | 'task'
  | 'priority'
  | 'routineItem'
  | 'event'
  | 'workout'
  | 'workoutGoal'
  | 'meal'
  | 'checkin'
  | 'expense'
  | 'goal'
  | 'project'
  | 'milestone'
  | 'win'
  | 'workInbox'
  | 'meeting'
  | 'studyItem'
  | 'book'
  | 'trip'
  | 'tripItem'
  | 'content'
  | 'partnership'
  | 'note'
  | 'brainDump'
  | 'pet'
  | 'petTask'
  | 'weeklyReview'
  | 'monthlyReview'

export const ENTITY_COLLECTION: Record<EntityType, CollectionKey> = {
  task: 'tasks',
  priority: 'priorities',
  routineItem: 'routineItems',
  event: 'events',
  workout: 'workouts',
  workoutGoal: 'workoutGoals',
  meal: 'meals',
  checkin: 'checkins',
  expense: 'expenses',
  goal: 'goals',
  project: 'projects',
  milestone: 'milestones',
  win: 'wins',
  workInbox: 'workInbox',
  meeting: 'meetings',
  studyItem: 'studyItems',
  book: 'books',
  trip: 'trips',
  tripItem: 'tripItems',
  content: 'contentItems',
  partnership: 'partnerships',
  note: 'notes',
  brainDump: 'brainDump',
  pet: 'pets',
  petTask: 'petTasks',
  weeklyReview: 'weeklyReviews',
  monthlyReview: 'monthlyReviews',
}

// ─── Aliases from the product brief (no duplicated structures) ──────────────

export type TaskOccurrence = Occurrence
export type RoutineOccurrence = Occurrence
export type ProjectTask = Task & { projectId: ID }
export type WaitingFor = Task & { status: 'waiting' }
export type LifeAdminItem = Task & { context: 'vida_real' }
export type WeeklyGoal = Goal & { level: 'semana' }
export type LongTermGoal = Goal & { level: 'maior' }
export type EmailAction = WorkInboxItem
export type TripReservation = TripItem
export type TripActivity = TripItem
export type TripPackingItem = TripItem
export type TripExpense = Expense & { tripId: ID }
export type ContentIdea = ContentItem & { stage: 'ideia' }
export type ContentPiece = ContentItem
