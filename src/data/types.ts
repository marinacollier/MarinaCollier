import type { Energy, LifeArea, MoSCoW } from './priority/contract'

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

/**
 * How firmly something sits in Marina's life. Shown as a small label, used by the planner.
 * - fixo: normally preserved in the calendar (reviews, presencial work, booked things)
 * - base: current pattern, may change week to week (natação 07h, cerâmica)
 * - flexivel: wanted, but the app may suggest another moment (yoga 1x/semana)
 * - a_confirmar: incomplete or unproven — never treated as a confirmed commitment
 */
export type PlanType = 'fixo' | 'base' | 'flexivel' | 'a_confirmar'

/** Approximate part of the day, for things without an exact time ("cerâmica — noite"). */
export type DayPeriod = 'manha' | 'almoco' | 'tarde' | 'noite'

export type WorkDayMode = 'presencial' | 'remoto' | 'flexivel' | 'off'

/** Where a task lives in Marina's head. */
export type Bucket = 'hoje' | 'semana' | 'algum_dia'

export type LifeAdminCategory =
  | 'casa'
  | 'carro'
  | 'bike'
  | 'surf'
  | 'running'
  | 'luna'
  | 'viagens'
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

/**
 * task / routineItem / petTask: recurring things done on a date.
 * event: "fui / feito" on a calendar event that day.
 * item: a Home line that has no done-state of its own — a follow-up ("Cobrar Fran"), a career next action,
 *   a deadline — keyed by the Home item key ('waiting:<taskId>', 'opportunity:<id>', 'content:<id>'…).
 * bill: a recurring payment (FinancialCategory with `bill`) paid in that period; date = period start.
 */
export type OccurrenceParent = 'task' | 'routineItem' | 'petTask' | 'event' | 'item' | 'bill'

/** A single dated completion (or skip) of something recurring. Also used as TaskOccurrence / RoutineOccurrence. */
export interface Occurrence extends Entity {
  parentType: OccurrenceParent
  parentId: ID
  date: DateKey
  status: 'done' | 'skipped'
  /** Free text written on that day (e.g. journaling inside the morning routine). */
  note?: string
  /** Indexes of RoutineItem.steps checked that day. */
  stepsDone?: number[]
  /** Real moment it was checked (the time she actually did it). */
  completedAt?: ISODateTime
  /** Minutes actually spent ("30 min de inglês executivo"). */
  durationMin?: number
}

// ─── Time-aware day (one life, one timeline) ────────────────────────────────

/**
 * How an item gets its time on a given day.
 * - fixed: `time` (and optional `endTime`)
 * - window: somewhere inside `window` (shown as "05:00–05:30")
 * - sequence: starts when the previous item of the same routine ends (derived from durations)
 * - anytime: explicit "ao longo do dia" — a decision, never a default
 */
export type TimeMode = 'fixed' | 'window' | 'sequence' | 'anytime'

export interface TimeWindow {
  start: TimeHM
  end: TimeHM
}

/** What a per-day override points at. `planMeal` refId = '<NutritionDayPlan.id>#<meal index>'; `routineStep` refId = '<RoutineItem.id>#<step index>'. */
/** 'work' refId = the DateKey (one per day): per-day work mode ('amanhã fiquei presencial'). */
export type ScheduleRefType = 'routineItem' | 'routineStep' | 'workout' | 'planMeal' | 'event' | 'task' | 'petTask' | 'weekTemplate' | 'mealPrep' | 'work'

/**
 * Change to ONE day only ("nesta quinta yoga às 20:00"). The recurring default never changes.
 * At most one per (date, refType, refId); the latest write wins.
 */
export interface ScheduleOverride extends Entity {
  date: DateKey
  refType: ScheduleRefType
  refId: string
  time?: TimeHM
  endTime?: TimeHM
  /** Not happening that day ("amanhã cancelei meu inglês"). Frees the slot; prep linked by `dependsOn` goes too. */
  cancelled?: boolean
  /** Explicit "qualquer momento" for that day. */
  anytime?: boolean
  /** Duration for that day only ("domingo o pedal passou pra 4h" → 240). */
  durationMin?: number
  /** refType 'work': that day's work mode ("amanhã fiquei presencial"). */
  workMode?: WorkDayMode
  /** Who changed it — Lumos changes are always undoable and shown as such. */
  by: 'marina' | 'lumos'
  reason?: string
}

/** One row of the unified day (rotina + treino + comida + agenda + tarefas). Derived, never stored. */
/** 'prep' = meal-prep checklist items (marmita na bolsa, freezer → geladeira); refId = PrepItem.key. */
export type TimelineKind = 'routine' | 'routineItem' | 'workout' | 'meal' | 'event' | 'work' | 'task' | 'petTask' | 'prep'

export type TimelineTimeSource = 'fixed' | 'window' | 'derived' | 'override' | 'anytime' | 'approx'

export interface TimelineEntry {
  /** Stable key for React + drag (e.g. 'routineItem:<id>', 'planMeal:<plan>#2'). */
  key: string
  kind: TimelineKind
  /** Target for ScheduleOverride when the time is edited. */
  ref: { type: ScheduleRefType; id: string }
  date: DateKey
  start?: TimeHM
  end?: TimeHM
  timeSource: TimelineTimeSource
  /** Shown when timeSource is 'window'. */
  window?: TimeWindow
  title: string
  subtitle?: string
  emoji?: string
  status: 'pending' | 'done' | 'skipped' | 'cancelled'
  /** Real time it happened (HH:MM, São Paulo) — "✓ 08:17". */
  doneAt?: TimeHM
  /** Group rows (Despertar, Higiene) carry their steps; times derived from durations when not explicit. */
  children?: TimelineEntry[]
  planType?: PlanType
  /** Fuel phase for meals/prep around trainings. */
  phase?: FuelPhase | 'refeicao'
  /** Where the content comes from (meals: nutri / troca / lumos). */
  badge?: ContentSource
  editable: { time: boolean; reorder: boolean; check: boolean }
}

/** Badge for content shown inside a meal / suggestion. */
export type ContentSource = 'nutri' | 'troca' | 'lumos' | 'marina'

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
  | 'mari' // the assistant (Lumos); key kept so saved module settings stay valid

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
  /** "HOJE · 📍 Trabalho presencial · 🏊 Natação · 💻 projeto prioritário" */
  | 'resumo_dia'
  /** Quick capture entry. */
  | 'brain_dump'
  /** Evening: "Amanhã é presencial 👜" prep checklist / tomorrow at a glance. */
  | 'amanha'
  /** The unified day: rotina + treino + comida + agenda + tarefas in one time-ordered list. */
  | 'linha_do_dia'

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
  /** Bucket used by "Meu treino da semana" (fallback: modalityGroup() in data/planning.ts). */
  group?: TrainingGroup
  /** Long sessions need big logistics (pedal longo): planner warns on presencial days. */
  heavyLogistics?: boolean
}

export type TrainingGroup = 'corrida' | 'natacao' | 'bike' | 'forca' | 'mobilidade' | 'fun' | 'off'

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

export type LockArea = 'dinheiro' | 'carreira' | 'atelie'

export interface PrivacyLock {
  enabled: boolean
  areas: LockArea[]
  /** Local code (always present, so she can never be locked out): PBKDF2-SHA256 hash + salt, base64. */
  pinHash: string
  pinSalt: string
  /** Face ID / Touch ID through WebAuthn (platform authenticator). Device-bound; absent after restoring elsewhere. */
  credentialId?: string
  /** Re-lock after the app stays in the background this long. */
  relockMinutes: number
}

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
  /** "Próximo estudo bíblico" as a quiet line on Home (default on; never overdue). */
  spiritualOnHome?: boolean
  waterGoal: number
  /** Set when Marina taps "Entrar no meu dia" on first run. */
  onboardedAt?: ISODateTime
  /** Optional overrides of the time-of-day boundaries used by the contextual home (hours, 0-23). */
  dayParts: { morningStart: number; middayStart: number; eveningStart: number }
  homeBase?: string
  /** A few lines about Marina's current context (shown in Ajustes, used by Lumos). */
  about?: string
  /** Base rhythm. Never a streak: if she wakes later, the day just adapts. */
  rhythm: { wakeTime: TimeHM; sleepTime: TimeHM }
  /** When the Daily MARINA OS (Lumos' morning briefing) is offered. Missing = '06:15'. */
  briefingTime?: TimeHM
  work: WorkSchedule
  /** UGC Business OS: who she is for brands, and her prospecting rhythm. */
  creator?: CreatorProfile
  ugc?: UgcPrefs
  /** Version of the life seed applied to this database (see data/seed/migrate.ts). */
  seedVersion?: number
  /** Seed record ids this install already received (a seed record she deleted never comes back). */
  seedIds?: string[]
  /** Seed record ids she deleted herself. */
  removedSeedIds?: string[]
  /** Bundled Daily Briefings (by date) already run through the importer on this install — never twice. */
  briefingsApplied?: DateKey[]
  /** Bundled weekly syncs (marina-os/changes@1, by id) she confirmed in the Central — never offered again. */
  syncsApplied?: string[]
  /** Bíblia reconciliations (by id, e.g. '2026-10-15') she reviewed and applied — never twice. */
  spiritualUpdatesApplied?: string[]
  /** One-time trip updates (by id, e.g. 'za-2026-10-31' = Atualização mestre 31/10) already applied — never twice. */
  tripUpdatesApplied?: string[]
  /** "Importar estudo" history (what came in, when, which fields she kept). */
  spiritualImports?: SpiritualImportLog[]
  /** Meu Universo: olfactory profile + makeup style (editable; seeded once when missing). */
  scentProfile?: ScentProfile
  /** Lumos may apply small meal adjustments without asking (off by default; always undoable). */
  lumosAutoApplySmall?: boolean
  /** Last time Marina talked to Lumos / opened Home — ChangeFeed baseline ("o que mudou?"). */
  lumosLastSeenAt?: ISODateTime
  /** Last successful full backup export (for Lumos' monthly reminder). */
  lastBackupAt?: ISODateTime
  /** Optional privacy lock for sensitive areas (not the whole app). A UI lock, not encryption at rest. */
  privacyLock?: PrivacyLock
  /** Food likes / aversions Lumos respects when choosing among the nutritionist's substitutions. */
  foodPrefs?: { likes: string[]; dislikes: string[] }
  /** This device syncs with the cloud (src/data/sync). Off unless she turns it on after "Enviar meus dados". Device-only. */
  cloudSync?: boolean
  /** When the first upload was verified on this device. Device-only. */
  cloudSyncSince?: ISODateTime
  /** Ateliê/private writing also goes to her owner-only Claude store (default on: the app's device storage gets wiped). */
  privateWritingCloud?: boolean
  /** Both this device and another edited the same record: the newer version was kept, the other is here for review. Device-only. */
  syncConflicts?: SyncConflict[]
  /**
   * Words a LinkedIn post can never contain (confidential clients, internal project names). Lives only on this
   * device — never in the seed or the code.
   */
  execBlockedTerms?: string[]
  /**
   * Modos de rotina (data/routine-modes.ts). Optional: missing = automatic (trip days → 'viagem', else 'brasil').
   * Precedence: `manual` (when the date is inside it) > a `periods` entry > trip day > 'brasil'.
   */
  routineModes?: RoutineModesConfig
  /** The base day: editable background blocks shown in the calendar (never conflicts, never on Home). */
  dayPlan?: { blocks: DayBlock[] }
  /** Flexible blocks: the engine places them on the day ('auto', default) or shows them for approval ('preview'). Fixed commitments are never moved either way. */
  planApply?: 'auto' | 'preview'
  /** Aprendizagem: language split, weekly target, reviews per day. Missing = defaults (70% inglês / 30% espanhol). */
  learningPlan?: LearningPlan
  /** Aprendizagem: session templates (missing = defaults). */
  learningTemplates?: LearningTemplate[]
  /** Aprendizagem: tools she has access to (missing = all). */
  learningTools?: LearningTool[]
  /** Aprendizagem: knowledge domains (missing = defaults; she can add new ones). */
  learningDomains?: LearningDomain[]
}

/** 'viagem' / 'ferias': home routine paused, no work base. 'transicao': recovery (essential routines, light workouts, no work base). */
export type RoutineMode = 'viagem' | 'transicao' | 'brasil' | 'ferias'

export interface RoutineModePeriod {
  mode: RoutineMode
  from: DateKey
  /** Inclusive. Missing = open-ended. */
  to?: DateKey
  label?: string
}

export interface RoutineModesConfig {
  periods: RoutineModePeriod[]
  /** "Mudar o modo" in Ajustes → Rotina. Wins over everything while the date is inside it. */
  manual?: { mode: RoutineMode; from: DateKey; to?: DateKey }
  /**
   * Milagre da Manhã goes Essential by itself on days with a workout starting before this time (default '08:00').
   * Only once `routineModes` exists (no config = the old behaviour: a gentle suggestion). Empty string = off.
   */
  essentialIfWorkoutBefore?: TimeHM | ''
}

export type DayBlockCategory =
  | 'ritual'
  | 'luna'
  | 'trabalho'
  | 'almoco'
  | 'treino'
  | 'estudo'
  | 'idiomas'
  | 'faculdade'
  | 'criatividade'
  | 'pessoal'
  | 'descanso'

/** One block of the base day ("Inglês 19:00–19:45, seg/qua"). */
export interface DayBlock {
  id: ID
  title: string
  category: DayBlockCategory
  /** 0 = domingo … 6 = sábado. */
  weekdays: number[]
  start: TimeHM
  end: TimeHM
  /** Modes in which it applies. Default ['brasil']. */
  modes?: RoutineMode[]
  /** 'base' = quiet background; 'sugerido' = a suggestion (hidden when something real takes its time). */
  kind: 'base' | 'sugerido'
  note?: string
}

export interface SyncConflict {
  id: ID
  /** DB collection key (or '_profile'). */
  collection: string
  recordId: string
  at: ISODateTime
  /** Which side was kept in the app. */
  kept: 'local' | 'remote'
  /** The version that was NOT kept (null = it was a deletion). */
  other: Record<string, unknown> | null
  otherVersion: number
}

export interface WorkSchedule {
  /** BASE working hours (not an absolute block). */
  start: TimeHM
  end: TimeHM
  /** Presencial location label. */
  location?: string
  /** Mode per weekday (0 = domingo). */
  days: Record<Weekday, WorkDayMode>
  /** Editable commute buffers around presencial hours. */
  commuteBeforeMin: number
  commuteAfterMin: number
  /** Optional checklist shown the evening before a presencial day. */
  presencialChecklist: string[]
}

// ─── Today / tasks / routines ───────────────────────────────────────────────

/**
 * What a dated thing IS (reunião, aula, treino…), whatever record it lives in. Derived by default
 * (data/calendar/kind.ts); an explicit `entryKind` on the record is her retag and always wins.
 */
export type EntryKind = 'reuniao' | 'aula' | 'treino' | 'tarefa' | 'trabalho' | 'estudo' | 'ugc' | 'reserva' | 'pessoal' | 'espiritualidade'

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
  context?: 'geral' | 'trabalho' | 'vida_real' | 'luna' | 'viagem' | 'conteudo' | 'estudo' | 'carreira'
  lifeAdminCategory?: LifeAdminCategory
  /** Life admin flavour: manutenção / comprar / resolver (waiting uses status 'waiting'). */
  adminKind?: 'manutencao' | 'comprar' | 'resolver'
  planType?: PlanType
  projectId?: ID
  tripId?: ID
  partnershipId?: ID
  /** Waiting For details when status === 'waiting'. */
  waiting?: { who: string; since: DateKey; followUpOn?: DateKey; /** Last time she said "ainda não respondeu". */ lastCheckedAt?: DateKey }
  /** Work: blocked until Marina acts ("Precisa de mim"). */
  needsMe?: boolean
  /** If set, the task is a recurring template; completions are Occurrences. */
  recurrence?: Recurrence
  /** Where it came from (brain dump, work inbox...). */
  origin?: { type: EntityType; id: ID }
  completedAt?: ISODateTime
  order: number
  // ── Career & Growth (reuses tasks; no parallel "career app") ──
  /** A weekly career quota ("Inglês executivo 3×/semana") or a session placed for one. */
  careerKind?: CareerKind
  /** Quota: sessions per week. */
  targetPerWeek?: number
  /** Quota: minutes per week (Desenvolvimento de liderança 1h). */
  targetMinutesPerWeek?: number
  /** Goal it serves (North Star / quarter objective). */
  goalId?: ID
  /** A dated session created for this quota by the planner or Lumos. */
  careerParentId?: ID
  // ── From the Daily Executive Briefing ──
  /** "Feito quando: …" — what done means for this to-do. */
  doneCriteria?: string
  /** Small free labels ('optional' for a briefing's Optional priority). */
  tags?: string[]
  /** A briefing's "Optional" (priority P3 + this flag). */
  optional?: boolean
  /** Other names a later briefing gave the same obligation ("Verificar/Regularizar B.O. de pedágio"). */
  aliases?: string[]
  /** Where it came from (imported records keep it; the record itself is hers once imported). */
  source?: ImportOrigin
  /** Small steps inside the task (UGC Business checklist). Checked state lives here, persisted with the task. */
  checklist?: TaskStep[]
  /** UGC Business: the brand this task is about (link to the source record). */
  brandId?: ID
  /** UGC Business: the demo/portfolio piece this task is about. */
  contentItemId?: ID
  /** Day it was planned for before she moved it ("Adiado"). */
  postponedFrom?: DateKey
  /** Her retag ("isso é uma reunião"). Missing = derived (data/calendar/kind.ts). */
  entryKind?: EntryKind
  /** Minutes she actually spent on it (optional log; "Minha semana" counts it as horas feitas). */
  spentMin?: number
  // ── Motor de prioridade (src/data/priority/*). All optional: missing = derived, never guessed as fact. ──
  /** Life area for the priority engine. Named `lifeArea` because `area` (legacy Area) already exists on Task. */
  lifeArea?: LifeArea
  /** Her explicit MoSCoW (wins over the contextual one). */
  moscow?: MoSCoW
  /** Energy it needs to be done well (1–5). */
  energyNeed?: Energy
  /** Rough effort: 1 leve · 2 médio · 3 pesado. */
  effort?: 1 | 2 | 3
  /** The concrete next step ("abrir o doc e escrever o título"). */
  nextStep?: string
  /** Goals it serves (in addition to the legacy single `goalId`). */
  goalIds?: ID[]
  /** RICE-lite (reach 1–5, impact 1–5, confidence 0.5/0.8/1, effort 1–5). */
  rice?: { reach: 1 | 2 | 3 | 4 | 5; impact: 1 | 2 | 3 | 4 | 5; confidence: 0.5 | 0.8 | 1; effort: 1 | 2 | 3 | 4 | 5 }
  /** What kind of thing it is (compromisso has a fixed time; flexível can move). */
  itemKind?: 'compromisso' | 'prazo' | 'flexivel' | 'habito' | 'projeto' | 'ideia'
}

export interface TaskStep {
  id: string
  title: string
  done: boolean
}

/** Provenance of anything the Daily Briefing brought in ("o que veio do briefing de hoje?"). */
export interface ImportOrigin {
  /** 'changes' = a marina-os/changes@1 file (ChatGPT round trip, Central de importação). */
  type: 'daily_briefing' | 'changes'
  label: string
  briefingDate: DateKey
  /** Deterministic key: the same item imported again is recognised, never duplicated. */
  sourceKey: string
  importBatchId: ID
}

/**
 * Something to remember / follow — NOT a to-do. A briefing's backlog watchlist lands here:
 *   scheduled → a future intention, with a time window when the briefing gave one (never a fake time)
 *   recurring → part of her life already (payments…), recognised, never re-created
 * It becomes a Task only when she gives it a day ("isso do Santander coloca terça") — `promotedTaskId`.
 */
export interface BacklogItem extends Entity {
  title: string
  kind: 'scheduled' | 'recurring'
  status: 'open' | 'promoted' | 'done' | 'dismissed'
  /** Front as the briefing named it ("Santander", "Vida/Admin"). */
  front?: string
  projectId?: ID
  tripId?: ID
  context?: Task['context']
  notes?: string
  /** "Semana de 12 a 16/10" → from/until; "a partir de 13/10" → from. Only what could be read safely. */
  window?: { from?: DateKey; until?: DateKey; label: string }
  /** The to-do that now carries it (promoted by her, or an equivalent task that already existed). */
  promotedTaskId?: ID
  /** What it was recognised as (recurring): e.g. "Pagamentos do mês". */
  recognizedAs?: string
  source: ImportOrigin
  /** Last briefing that mentioned it. */
  lastSeenBriefing?: DateKey
}

/** One import of a Daily Briefing — for "Desfazer importação" and a light history in Dados. */
export interface ImportBatch extends Entity {
  source: string
  briefingDate: DateKey
  importedAt: ISODateTime
  counts: { created: number; updated: number; ignored: number; reviewRequired: number }
  /** What this import wrote, with what was there before — undo touches only what is still as it left it. */
  /** 'removed' keeps the whole record in `previous` (an explicit delete), so undo can put it back. */
  changes: { collection: CollectionKey; id: ID; op: 'created' | 'updated' | 'removed'; previous?: Record<string, unknown>; stamp: ISODateTime }[]
  /** How each item was understood (for "o que veio do briefing?"). 'change' = an item of a marina-os/changes@1 file. */
  items: { kind: 'today' | 'future' | 'waiting' | 'recurring' | 'change'; title: string; collection?: CollectionKey; id?: ID; how: 'created' | 'updated' | 'linked' | 'kept' | 'ignored'; /** changes@1: the item's type and per-item result in her words. */ type?: string; result?: string }[]
  review: { title: string; reason: string }[]
  sourceKeys: string[]
  /** changes@1: sourceKey / externalRef → the record it became (identity for the next import of the same thing). */
  refs?: Record<string, { collection: CollectionKey; id: ID }>
  /** Where the file came from ('Daily Executive Briefing', 'ChatGPT'…); `kind` tells the two importers apart. */
  kind?: 'briefing' | 'changes'
  undoneAt?: ISODateTime
}

export type CareerKind = 'ingles_exec' | 'networking' | 'post' | 'lideranca' | 'review'

/** "Minhas 3 prioridades de hoje". Max 3 per date. Can point at any entity. */
export interface DayPriority extends Entity {
  date: DateKey
  /** Top 3 per domain (max 3 each). Undefined = the day's main Top 3. */
  domain?: 'trabalho' | 'corpo' | 'vida'
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
  planType?: PlanType
  /** Base start time (e.g. 04:40). Adapts if the day starts later — never a streak. */
  startTime?: TimeHM
  /** Has a short "Essential" version (items with essential=true). Choosing it never breaks the routine. */
  hasEssential?: boolean
  /** Label for the short version, e.g. "Essential". */
  essentialName?: string
  /** Free note about the routine ("obs"), edited from any row of it. */
  notes?: string
  /** Pauses on trip days (a routine tied to the house). Her personal rituals (Milagre da Manhã, Encerrar o dia) travel with her. */
  pauseOnTrips?: boolean
}

export interface RoutineItem extends Entity {
  routineId: ID
  title: string
  emoji?: string
  /** Usually { kind: 'weekly', weekdays: [...] } — "quais itens aparecem em cada dia". */
  recurrence: Recurrence
  order: number
  active: boolean
  /** Default scheduled time (e.g. 04:40 Despertar). Per-day changes live in ScheduleOverride. */
  time?: TimeHM
  /** Default end (scheduledEndTime). */
  endTime?: TimeHM
  /** Expected minutes; used to derive the next item's time in 'sequence' mode and the end time. */
  durationMin?: number
  /** Missing = 'fixed' when `time` is set, otherwise 'sequence'. 'anytime' must be set explicitly. */
  timeMode?: TimeMode
  /** preferredTimeWindow, e.g. 05:00–05:30. */
  window?: TimeWindow
  /** Can slide without it being a conflict. */
  timeFlexible?: boolean
  /** Minutes per step (same index as `steps`) so each step gets its own derived time. */
  stepDurations?: number[]
  /** Must happen after these (RoutineItem ids, or 'workout' = after the day's first training). */
  dependsOn?: (ID | 'workout')[]
  /** Where the default came from. */
  source?: 'seed' | 'marina' | 'lumos'
  /** Optional sub-checklist (Higiene: raspar língua, lavar rosto...). Checks live in Occurrence.stepsDone. */
  steps?: string[]
  /** Part of the short version; `essentialLabel` replaces the title there ("5 min de leitura"). */
  essential?: boolean
  essentialLabel?: string
  /** Not counted as missing when skipped (e.g. Luna at daycare). */
  optional?: boolean
  /** Accepts text for the day (journaling) — stored in Occurrence.note. */
  acceptsText?: boolean
  /** Short hint shown when expanded ("depende do treino do dia"). */
  hint?: string
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
  kind?: 'pessoal' | 'trabalho' | 'treino' | 'viagem' | 'saude' | 'luna' | 'criatividade' | 'estudo' | 'outro'
  /** Life category label shown on the event ("Vida / Criatividade"). */
  category?: string
  planType?: PlanType
  /** When there is no exact time: approximate part of the day. */
  period?: DayPeriod
  /** Dates of a recurring event cancelled for that week only. */
  exdates?: DateKey[]
  /** Last day of a recurring series ("não faço mais cerâmica"): nothing after it; the past stays. */
  until?: DateKey
  /** Checklist template opened with the event (Weekly CEO Review topics). */
  template?: string[]
  projectId?: ID
  tripId?: ID
  recurrence?: Recurrence
  external?: ExternalRef
  /** Her retag ("isso é uma reunião"). Missing = derived (data/calendar/kind.ts). Not the life `kind` above. */
  entryKind?: EntryKind
  /** Language the meeting happens in, when she says so (StudyTrack id, e.g. 'track-ingles'). Used by Aprendizagem. */
  language?: ID
  /** IANA zone the stored date/startTime/endTime are expressed in (synced events: the zone she lives in that day). */
  timeZone?: string
  /** Synced from the external calendar (mirrored; changes there are detected). */
  attendees?: EventAttendee[]
}

export interface EventAttendee {
  email: string
  name?: string
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction'
  self?: boolean
  organizer?: boolean
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
  planType?: PlanType
  /** Approximate window when there's no exact time. */
  period?: DayPeriod
  /** Created from a WeekTemplateItem. */
  templateId?: ID
  // ── Training load & fuel (time = startTime, plannedDurationMin = expected, durationMin = actual) ──
  sessionType?: SessionType
  /** Upper bound of the expected duration ("60–75 min"). */
  plannedDurationMaxMin?: number
  loadCategory?: LoadCategory
  isKeySession?: boolean
  isLongSession?: boolean
  requiresPreviousDayPrep?: boolean
  requiresPreWorkout?: boolean
  requiresIntraWorkout?: boolean
  requiresPostWorkout?: boolean
  /** Explicit strategy; otherwise resolved by tags (see data/fuel.ts). */
  nutritionStrategyId?: ID
  recoveryPriority?: 'normal' | 'alta'
  /** Free tags: 'long-run', 'key-session', 'fuel-required', 'pernas'... */
  tags?: string[]
  /** Fuel steps Marina marked as done (tracking, never a score). */
  fuelDone?: FuelPhase[]
  /** Planned duration when the strategy was last reviewed — used to suggest a review after big changes. */
  strategyReviewedAtMin?: number
  /** Quick check-in after a key session. */
  postCheckin?: PostWorkoutCheckin
  /**
   * Whether THIS session uses a pass check-in (TotalPass…). undefined = follow the constraint's modality
   * list; false = not via the pass (e.g. yoga by the app); true = counts even if the modality isn't listed.
   */
  usesCheckin?: boolean
}

export type SessionType = 'endurance' | 'forca' | 'qualidade' | 'tecnica' | 'longo' | 'recuperacao' | 'mobilidade' | 'fun' | 'outro'
export type LoadCategory = 'key' | 'moderada' | 'leve' | 'descanso'
export type FuelPhase = 'ontem' | 'pre' | 'intra' | 'pos'

export interface PostWorkoutCheckin {
  energia?: 'baixa' | 'ok' | 'otima'
  treino?: 'mais_facil' | 'esperado' | 'mais_dificil'
  nutricao?: 'funcionou' | 'ajustar' | 'nao_usei'
  recuperacao?: 'boa' | 'atencao'
  nota?: string
  at: ISODateTime
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
  planType?: PlanType
  /** Flexible weekly intent ("Yoga — 1x/semana"): the planner suggests free windows. */
  perWeek?: number
  /** Fun goals (circo) are never counted as an obligation. */
  obligation?: boolean
  /** Preferred weekdays for suggestions (circo → sábado). */
  preferredWeekdays?: Weekday[]
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
  /** Why this meal: around a training or general. */
  purpose?: MealPurpose
  /** Training this meal relates to (before/after/intra). */
  workoutId?: ID
  /** Prescribed meal it follows: '<NutritionDayPlan.id>#<meal index>'. */
  planMealRef?: string
  /** Time the plan had for it (kept next to the real time). */
  plannedTime?: TimeHM
  /** Real moment she ate (set automatically by "comi"). `time` mirrors its HH:MM for older screens. */
  consumedAt?: ISODateTime
  /** What was actually eaten, with nutrients when known. Empty = followed the plan as prescribed. */
  foods?: LoggedFood[]
  /** Who decided the content: the plan, a plan swap, a Lumos suggestion or Marina herself. */
  contentSource?: ContentSource
  /** How it was registered ("comi um YoPRO" → 'lumos'). */
  loggedVia?: 'botao' | 'lumos' | 'formulario'
}

// ─── Meal prep (operationalizes the plan for a week) ─────────────────────────

/**
 * One week of meal prep ("faz minhas marmitas"). Derived content (menu, shopping list, batch steps,
 * pots, kits) is computed from the plans + this record's choices; only decisions and progress are stored.
 * Keys: plan item = '<NutritionDayPlan.id>#<meal index>#<item index>'; pot = '<DateKey>#<meal index>'.
 */
export interface MealPrepPlan extends Entity {
  /** Monday of the week (DateKey). One active plan per week. */
  weekStart: DateKey
  /** Substitution picked for a given day's plan item (text exactly as in PlannedFood.substitutions). Key: '<DateKey>#<meal index>#<item index>'. */
  choices: Record<string, string>
  /** Ingredients Marina says she already has at home (lowercase names). */
  pantry: string[]
  /** Shopping-list keys / batch-step keys / pot keys she ticked. */
  checked: string[]
  /** Where each prepared pot is ('geladeira' | 'freezer') and whether it's been eaten. */
  pots?: Record<string, 'geladeira' | 'freezer' | 'consumido'>
  notes?: string
  by: 'lumos' | 'marina'
}

/** What's at home: ingredients ("já tenho arroz, whey e café") and prepared food ("fiz 6 porções de frango"). */
export interface PantryItem extends Entity {
  name: string
  kind: 'ingrediente' | 'preparado'
  /** Prepared food: portions made and still left. */
  portions?: number
  remaining?: number
  gramsPerPortion?: number
  madeAt?: DateKey
  storage?: 'despensa' | 'geladeira' | 'freezer'
  /** Bought every week (café, whey…) — shopping lists consider it without asking. */
  recurring?: boolean
  /** Plan item it covers, when known ('<planId>#<meal>#<item>' or a food name). */
  covers?: string[]
}

// ─── Lumos intelligence layer (provenance, life log, attention) ─────────────

/** Where a piece of information came from — Lumos must always know. */
export type Provenance = 'user' | 'fact' | 'integration' | 'inference' | 'suggestion'
export type Confidence = 'high' | 'medium' | 'low'

/**
 * Something that really happened (or really changed), kept for history and "o que mudou?".
 * Written by Lumos actions, ActionGraph propagation, integrations and important manual changes.
 */
export interface LifeEvent extends Entity {
  at: ISODateTime
  /** Day it concerns (may differ from `at`: "amanhã fiquei presencial"). */
  date: DateKey
  kind: 'done' | 'logged' | 'changed' | 'moved' | 'cancelled' | 'created' | 'finished' | 'resolved' | 'learned' | 'integration'
  /** Short human line in pt-BR ("Pedal de domingo passou pra 4h"). */
  title: string
  area?: MemoryArea
  ref?: { type: EntityType | ScheduleRefType | 'pantry' | 'memory'; id: string }
  by: 'marina' | 'lumos' | 'integration' | 'system'
  provenance: Provenance
  confidence?: Confidence
  /** Other events caused by this one (ActionGraph): ids of LifeEvents. */
  causedBy?: ID
}

/** A NeedsAttention item Marina resolved or dismissed (items themselves are derived, keyed). */
export interface AttentionAck extends Entity {
  key: string
  how: 'resolved' | 'dismissed' | 'snoozed'
  until?: DateKey
}

// ─── Lumos memory (what Lumos knows about Marina; editable) ─────────────────

export type MemoryKind = 'fact' | 'preference' | 'state' | 'history'
export type MemoryArea = 'rotina' | 'trabalho' | 'esportes' | 'alimentacao' | 'estudos' | 'leitura' | 'viagens' | 'habitos' | 'luna' | 'casa' | 'financas' | 'uso_app'

/**
 * One thing Lumos knows. FACTS ("mora em São Paulo"), PREFERENCES ("treino pesado de manhã"),
 * CURRENT STATE ("lendo Continuous Discovery Habits"), HISTORY ("terminou X em 05/10").
 * An observed pattern is NEVER a rule: status 'observed' + evidence count until Marina confirms.
 */
export interface MemoryItem extends Entity {
  kind: MemoryKind
  area: MemoryArea
  text: string
  /** Stable key so Lumos updates instead of duplicating ('yoga.weekday', 'book.current'). */
  key?: string
  status: 'confirmed' | 'observed' | 'archived'
  source: 'seed' | 'marina' | 'lumos' | 'observed'
  /** Times the pattern was seen (observed items). */
  evidence?: number
  lastSeenAt?: ISODateTime
  /** When Lumos asked "quer que eu considere isso como preferência?" (asks once). */
  askedAt?: ISODateTime
  ref?: { type: EntityType; id: ID }
}

// ─── Nutrition ledger (execution layer over the nutritionist's plan) ────────

export interface Nutrients {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
}

/**
 * How much to trust the numbers.
 * label = rótulo do produto informado; reference = tabela de composição (TACO/IBGE) por gramas;
 * plan = calculado das gramas do plano; estimated = estimativa declarada; unknown = sem números.
 */
export type NutrientConfidence = 'label' | 'reference' | 'plan' | 'estimated' | 'unknown'

/** "Meus alimentos" + the built-in reference foods. One serving = `serving`. */
export interface FoodItem extends Entity {
  name: string
  /** Lowercase, accent-free names used by the parser ("yopro", "iogurte proteico"). */
  aliases: string[]
  emoji?: string
  serving: { label: string; grams?: number; ml?: number }
  /** Nutrients of ONE serving. */
  nutrients: Nutrients
  confidence: NutrientConfidence
  /** Where the numbers came from ("rótulo YoPRO 250 ml", "TACO 4ª ed."). */
  sourceNote?: string
  /** Saved by Marina → shows first, one-tap logging. */
  mine?: boolean
  uses?: number
  lastUsedAt?: ISODateTime
}

export interface LoggedFood {
  name: string
  /** Servings of `foodId` (1 YoPRO = 1). */
  qty: number
  unitLabel?: string
  grams?: number
  foodId?: ID
  nutrients?: Nutrients
  confidence: NutrientConfidence
}

/** A proposed or applied change to a FUTURE planned meal of one day. Original plan is never edited. */
export interface MealAdjustment extends Entity {
  date: DateKey
  /** '<NutritionDayPlan.id>#<meal index>' */
  planMealRef: string
  kind: 'manter' | 'adaptar' | 'trocar' | 'pular'
  /** Resulting items; each carries its badge (nutri = unchanged, troca = plan equivalence, lumos = suggestion). */
  items: (PlannedFood & { badge: ContentSource })[]
  /** One short human line ("Como você adicionou YoPRO às 14:30…"). */
  reason: string
  status: 'proposed' | 'applied' | 'dismissed'
  /** Meal id that triggered it (the extra). */
  triggerMealId?: ID
  by: 'lumos' | 'marina'
}

export type MealPurpose =
  | 'geral'
  | 'pre_treino'
  | 'intra_treino'
  | 'pos_treino'
  | 'recovery'
  | 'pre_long_run'
  | 'post_long_run'
  | 'pre_long_ride'
  | 'post_long_ride'
  | 'prep_dia_anterior'

/** Favorite meals for one-tap logging. */
export interface MealTemplate extends Entity {
  name: string
  description: string
  slot?: MealSlot
  tags: FoodTag[]
  order: number
}

export type DayChangeAction = 'adiar' | 'trocar' | 'dividir' | 'concluir' | 'hoje_nao' | 'sem_energia' | 'menos_tempo' | 'mais_tempo' | 'mais_tarde'

/**
 * Check-in do dia for the priority engine ("quanto tempo livre tu tem hoje?"). One per local day (`date` unique).
 * Separate from DailyCheckIn (habits/closing) so the engine never rewrites her habit records.
 */
export interface DayCheckin extends Entity {
  date: DateKey
  /** Minutes free for flexible activities (her answer or "calcula pela agenda"). */
  freeMin?: number
  focusMin?: number
  energy?: Energy
  mood?: string
  note?: string
  /** "Interesse de hoje" (free text / chips): filters and boosts the plan; "descansar" means rest. */
  interest?: string
  /** She tapped "Pular" — the card stays away for the day, the plan runs on the calendar alone. */
  skipped?: boolean
  /** The last plan she saw (candidate keys). */
  plan?: { primary?: string; secondary: string[]; deferred: string[] }
  changes: { at: ISODateTime; key: string; action: DayChangeAction; reason?: string }[]
  /** End-of-day review (optional, after 20:00). */
  review?: { aconteceu?: string; pendente?: string; mudou?: string; amanha?: string; at?: ISODateTime; dismissed?: boolean }
  /**
   * The day's ALLOCATION: flexible things placed on the timeline. Each block points at an existing entity by
   * its candidate key ('task:<id>', 'study:review', 'prep:event:<id>'…) — never a copy of it. Undefined =
   * nothing applied yet (the timeline then shows the engine's proposal).
   */
  blocks?: PlannedBlock[]
}

export type PlannedBlockStatus = 'planejado' | 'feito' | 'removido'

export interface PlannedBlock {
  key: string
  start: TimeHM
  end: TimeHM
  status: PlannedBlockStatus
  /** The engine placed it, or she did (her blocks are never moved by a replan). */
  by: 'motor' | 'marina'
  /** Title when placed — display fallback only; the entity stays the source of truth. */
  title: string
  at: ISODateTime
}

/** One per day (id is free, `date` is unique). Holds check-in, simple habits and the daily closing. */
export interface DailyCheckIn extends Entity {
  date: DateKey
  energia?: 'baixa' | 'media' | 'alta'
  sono?: 'ruim' | 'ok' | 'bom'
  corpo?: 'cansado' | 'normal' | 'forte'
  humor?: 1 | 2 | 3 | 4 | 5
  nota?: string
  /** Last night's sleep, recorded on the day she woke up (the quick "Sono" form). `sono` stays the 3-level summary. */
  sleep?: { bed?: TimeHM; wake?: TimeHM; hours?: number; quality?: 1 | 2 | 3 | 4 | 5 }
  habits: {
    agua: number
    proteina: boolean
    fruta: boolean
    vegetais: boolean
    refeicoesPlanejadas: boolean
  }
  /** "Hoje vou de versão curta": routineId → mode for that day. */
  routineModes?: Record<ID, 'completa' | 'essential'>
  closing?: {
    mood: 'bom' | 'neutro' | 'cansado'
    closedAt: ISODateTime
    winText?: string
  }
}

// ─── Nutrition (organizes Marina's + nutritionist's guidance; never prescribes) ──

export type NutritionSource = 'nutricionista' | 'usuaria' | 'outro_profissional'

/** Guidance attached to a kind of training ("Long run", "Long ride", "Leg day"). */
export interface NutritionStrategy extends Entity {
  name: string
  /** Matched against Workout.tags / sessionType / modality ('long-run', 'long-ride', 'leg-day'...). */
  linkedWorkoutTypes: string[]
  previousDayInstructions?: string
  preWorkoutInstructions?: string
  duringWorkoutInstructions?: string
  postWorkoutInstructions?: string
  timing?: string
  notes?: string
  source: NutritionSource
  sourceName?: string
}

/** Day type used to pick a day plan — derived from the trainings, not the weekday name. */
export type NutritionDayType = 'descanso' | 'leve' | 'moderado' | 'forca_pesada' | 'corrida_longa' | 'pedal_longo' | 'prep_longo'

export interface PlannedFood {
  food: string
  qty?: string
  /** Grams parsed from qty ("2 Fatia(s) (50g)" → 50). */
  grams?: number
  /** Computed from a reference table when the plan has no numbers. */
  nutrients?: Nutrients
  nutrientConfidence?: NutrientConfidence
  /** "Opções de substituição" exactly as prescribed. */
  substitutions?: string[]
}

export interface PlannedMeal {
  time?: TimeHM
  name: string
  phase?: FuelPhase | 'refeicao'
  items: PlannedFood[]
  notes?: string
}

/** A prescribed day plan (e.g. the nutritionist's "SEXTA" PDF). */
export interface NutritionDayPlan extends Entity {
  name: string
  dayType: NutritionDayType
  /** Weekday(s) it was prescribed for — used as a tie-breaker; the day type wins when trainings move. */
  weekdays: Weekday[]
  meals: PlannedMeal[]
  source: NutritionSource
  sourceName?: string
  prescribedAt?: DateKey
  notes?: string
  active: boolean
}

/** Body composition reference — lives in Corpo → Evolução, never on Home. */
export interface BodyComposition extends Entity {
  /** Missing for undated historical references ("Referência 2022"). */
  date?: DateKey
  label?: string
  weightKg?: number
  bodyFatPct?: number
  fatMassKg?: number
  skeletalMuscleKg?: number
  notes?: string
  /** History only — never used as a target. */
  historical?: boolean
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
  /**
   * Spending: 'paid' | 'planned_purchase' (Compras planejadas, not spent yet).
   * Income (type 'income'): 'expected' | 'received' | 'cancelled'. "Atrasado" is DERIVED (expected and the
   * date has passed) — never stored, and nothing ever becomes 'received' just because the date arrived.
   */
  status: 'paid' | 'planned_purchase' | 'expected' | 'received' | 'cancelled'
  notes?: string
  tripId?: ID
  accountId?: ID
  origin: 'manual' | 'organizze'
  external?: ExternalRef
  /** Set by duplicate detection when an imported transaction looks like a manual one. Marina decides. */
  possibleDuplicateOf?: ID
  // ── Income / receivables (same record evolves: expected → received; never a second entry) ──
  /** Missing = 'expense' (every record before this field existed). */
  type?: 'expense' | 'income'
  /** Contract it comes from (receivable of a recurring contract). One record per contract per `period`. */
  contractId?: ID
  /** 'YYYY-MM' the receivable belongs to. */
  period?: string
  expectedDate?: DateKey
  expectedAmountCents?: number
  receivedAt?: ISODateTime
  receivedAmountCents?: number
  currency?: 'BRL' | 'USD' | 'EUR' | 'ZAR'
  /** Trip spending (bank statement line): the trip budget category it counts under. */
  tripCategory?: TripBudgetCategory
  /** Who created it: a contract's monthly expectation, Marina by hand, Lumos, an integration. */
  source?: 'contrato' | 'manual' | 'lumos' | 'organizze'
  /** UGC deal this money belongs to (expected when closed → received when paid). */
  ugcOpportunityId?: ID
  /** Bought and waiting to arrive ("comprado, entrega pendente"). Missing = nothing to deliver. */
  delivery?: ExpenseDelivery
}

export interface ExpenseDelivery {
  status: 'pendente' | 'recebido'
  /** Expected arrival, when the store/carrier said. */
  expected?: DateKey
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

/**
 * A recurring PJ contract (Santander, Fashion Finder…). Values are GROSS billing as informed by Marina —
 * never net, never assumed taxes. Its monthly receivables are Expense records with type 'income'.
 */
export interface FinancialContract extends Entity {
  client: string
  /** Lowercase, accent-free names Lumos matches ("fashion finder", "ff"). */
  aliases?: string[]
  projectId?: ID
  amountCents: number
  currency: 'BRL' | 'USD' | 'EUR'
  /** Day of month the payment is expected (1–31; clamped to the month's last day). */
  paymentDay: number
  recurrence: 'mensal'
  status: 'ativo' | 'pausado' | 'encerrado'
  kind?: 'pj' | 'clt' | 'outro'
  startDate?: DateKey
  endDate?: DateKey
  notes?: string
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
  /**
   * A recurring payment she controls with a check ("Aluguel", "Cartão C6", "Hortifruti e carnes — semanal").
   * No amount is ever assumed; `dueDay` only when she tells it (then it shows on Hoje that day).
   */
  bill?: { every: 'mes' | 'semana'; dueDay?: number }
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
  /** Aprendizagem: knowledge domain this goal is about (makes matching study "prioritária"). */
  learningDomain?: string
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
  /** Language the project works in, when she says so (StudyTrack id). Used by Aprendizagem for meeting prep. */
  language?: ID
  links: Link[]
  files: Link[]
  people: Person[]
  notes?: string
  decisions: LogEntry[]
  changelog: LogEntry[]
  /** 'creator' marks the UGC/Content front, which gets the Creator OS view. */
  kind: 'default' | 'creator'
  order: number
  /** Work areas inside the project (Day One AI: Planner, Match, Smart Flight...). Tasks use Task.group. */
  sections?: string[]
  /** Content series tied to a trip ("Um mês sozinha na África do Sul"). */
  tripId?: ID
  /** Content categories for creator projects. */
  categories?: string[]
  /**
   * Capacidade planejada (horas por semana) — uma proposta de planejamento, não um contrato.
   * Missing = o projeto não entra na conta de capacidade de "Minha semana".
   */
  weeklyHours?: number
  /** A partir de quando `weeklyHours` vale (ex.: um projeto que começa em dezembro). */
  weeklyHoursFrom?: DateKey
}

export interface ProjectMilestone extends Entity {
  projectId: ID
  title: string
  date?: DateKey
  done: boolean
  order: number
  /** Roadmap lane ("Infra / catálogo", "Busca", "Produto"...). */
  group?: string
  /** Roadmap state; never assume 'pendente' for seeded items. done mirrors status === 'feito'. */
  status?: 'roadmap' | 'em_andamento' | 'feito'
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
  // ── Executive evidence (case) — same record, promoted when it's worth telling in an interview ──
  /** Turned into an executive case ("evidência"). */
  evidence?: boolean
  context?: string
  responsibility?: string
  decision?: string
  /** Numbers that prove the impact. Missing = the case shows "sem métricas". */
  metrics?: string
  confidentiality?: 'publico' | 'interno' | 'confidencial'
  verification?: 'rascunho' | 'verificado'
}

// ─── Career pipeline (only the two entities that didn't exist) ──────────────

export type OpportunityStatus = 'radar' | 'conversa' | 'processo' | 'entrevista' | 'proposta' | 'fechada' | 'descartada'

/** A role in her pipeline. Never invented: created only from what Marina says or types. */
export interface Opportunity extends Entity {
  company: string
  role: string
  country?: string
  workModel?: 'remoto' | 'hibrido' | 'presencial'
  /** Free text as she said it ("R$ 40–45k CLT", "USD 180k"). */
  compensation?: string
  employmentType?: 'clt' | 'pj' | 'internacional' | 'outro'
  status: OpportunityStatus
  nextAction?: string
  nextActionDate?: DateKey
  contactIds?: ID[]
  notes?: string
  /** Last time something happened (for "sem follow-up há N dias"). */
  lastActivityAt?: DateKey
  history?: { date: DateKey; status: OpportunityStatus; note?: string }[]
}

export interface ProfessionalContact extends Entity {
  name: string
  company?: string
  role?: string
  relationship?: 'mentor' | 'recrutador' | 'par' | 'lideranca' | 'cliente' | 'amizade' | 'outro'
  lastInteraction?: DateKey
  nextFollowUp?: DateKey
  notes?: string
  interactions?: { date: DateKey; note?: string }[]
}

// ─── Executive brand: LinkedIn posts (Modo A — no LinkedIn API, no scraping) ─

/** ideia → rascunho → revisao → aprovado → publicado. Any body edit after approval drops back to rascunho. */
export type ExecPostStatus = 'ideia' | 'rascunho' | 'revisao' | 'aprovado' | 'publicado' | 'arquivado'

/**
 * A LinkedIn post. Marina approves the exact text (snapshot + SHA-256); only an approved, unchanged text can be
 * copied for publishing. The app never talks to LinkedIn: she pastes the text there and pastes the URL back.
 */
export interface ExecPost extends Entity {
  title: string
  status: ExecPostStatus
  body: string
  language: 'en' | 'pt' | 'en+pt'
  /** Editorial pillar (free text, e.g. "IA em finanças reguladas"). */
  pillar?: string
  /** Day she means to publish (São Paulo). */
  plannedDate?: DateKey
  /** Wins this post was drafted from. */
  sourceWinIds?: ID[]
  /** Marina's own checks before review. */
  checks: { ndaOk: boolean; claimsVerified: boolean }
  approval?: { approvedAt: ISODateTime; bodyHash: string; bodySnapshot: string }
  publication?: {
    publishedOn: DateKey
    url: string
    /** urn:li:activity:… / urn:li:share:… when the URL carries it. */
    urn?: string
    /** She confirmed she published exactly the approved text. */
    matchesApproved: boolean
    /** If she changed it on LinkedIn, the text that went out. */
    finalBody?: string
  }
  /** Numbers she reads in LinkedIn analytics (manual or, later, XLSX import). */
  metrics?: ExecPostMetric[]
  notes?: string
  order: number
}

export interface ExecPostMetric {
  capturedOn: DateKey
  source: 'manual' | 'xlsx'
  impressions?: number
  membersReached?: number
  reactions?: number
  comments?: number
  reposts?: number
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
  status?: 'ativo' | 'continuo' | 'pausado'
  /** Ways of studying this track (Inglês: Cambly, conversação, vocabulário...). */
  formats?: string[]
  notes?: string
  /** Level she (or a teacher/test) assessed ("B2"). Never inferred from hours: missing = "nível: a avaliar". */
  level?: string
  /** Where she wants to get ("C1"). */
  goalLevel?: string
  /** Knowledge domain id (Aprendizagem). Missing = derived for known tracks, else 'outros'. */
  domain?: string
}

export type StudyStatus = 'estudando' | 'proximo' | 'backlog' | 'pausado' | 'finalizado'

export interface StudyItem extends Entity {
  trackId?: ID
  title: string
  kind: 'curso' | 'aula' | 'artigo' | 'video' | 'livro' | 'tema' | 'certificacao' | 'podcast' | 'newsletter' | 'outro'
  /** Reference content she follows (Product Talk, Lenny's…): shown only on demand, NEVER a task or "atrasado". */
  reference?: boolean
  source?: string
  link?: string
  status: StudyStatus
  progress: number
  nextContent?: string
  notes?: string
  order: number
  finishedAt?: DateKey
  /** Aprendizagem · Biblioteca (all optional). */
  domain?: string
  relatedDomains?: string[]
  tags?: string[]
  resourceType?: LearningResourceType
  contentLanguage?: string
  libraryStatus?: LibraryStatus
  /** Each status she marked, with its day (conclui ≠ apliquei: both can be there). */
  libraryLog?: { status: LibraryStatus; date: DateKey; note?: string }[]
}

// ─── Aprendizagem (sessions, review cards, library, plan) ────────────────────
//
// Study is multidisciplinary: every session has ONE main `domain` (its minutes count there, once) and may
// touch others (`relatedDomains`, shown as "também tocou", never summed twice). The language split
// (70% inglês / 30% espanhol) lives only inside the 'idiomas' domain.

/** Language skills (fixed ids) — `skills` also accepts free skills ("business english", "discovery"). */
export type LanguageSkill = 'grammar' | 'reading' | 'writing' | 'listening' | 'speaking' | 'pronunciation' | 'vocabulary' | 'review'
/** @deprecated name kept for readability: a language skill id. */
export type LearningSkill = LanguageSkill
export type LearningTool = 'cambly' | 'flexcil' | 'chatgpt' | 'curso' | 'livro' | 'podcast' | 'video' | 'aula' | 'conversa' | 'outro'
export type LearningResourceType =
  | 'livro'
  | 'podcast'
  | 'video'
  | 'artigo'
  | 'curso'
  | 'aula'
  | 'pratica'
  | 'exercicio'
  | 'projeto'
  | 'documentario'
  | 'estudo_biblico'
  | 'anotacao'
  | 'newsletter'
export type LearningMode = 'leitura' | 'listening' | 'speaking' | 'escrita' | 'pratica' | 'reflexao' | 'pesquisa' | 'aplicacao'
export type StudySessionStatus = 'planejado' | 'iniciado' | 'concluido' | 'abandonado'
/** Library statuses — not equivalent: finishing (conclui) is not learning (anotei / pratiquei / apliquei). */
export type LibraryStatus = 'quero_conhecer' | 'comecei' | 'conclui' | 'abandonei' | 'anotei' | 'pratiquei' | 'apliquei'

/** One knowledge domain (configurable in profile.learningDomains; new ones need no code). */
export interface LearningDomain {
  id: string
  label: string
  emoji?: string
}

/**
 * One real study session, any domain. `minutes` count ONCE in every total, however many domains, topics,
 * skills or goals it touches. A session linked to a calendar class replaces that class in the totals.
 */
export interface StudySession extends Entity {
  date: DateKey
  startTime?: TimeHM
  minutes: number
  /** Main domain id (profile.learningDomains: 'idiomas', 'ia', 'cristianismo_teologia'…). Its minutes count here only. */
  domain: string
  /** Other domains it touched ("também tocou") — never summed into their totals. */
  relatedDomains?: string[]
  /** StudyTrack id when it belongs to one (Inglês, Espanhol, Pós…). Language sessions: the language track. */
  trackId?: ID
  /** Short title ("Speaking practice / Professional role-play"). */
  title?: string
  /** Only skills she said she practised: language ids (LanguageSkill) or free text ("business english"). Never inferred. */
  skills?: string[]
  /** Free subjects ("agentes de IA", "história do cristianismo"). */
  topics?: string[]
  /** Free tags she creates. */
  tags?: string[]
  resourceType?: LearningResourceType
  /** StudyItem / Book id of the resource used. */
  resourceId?: ID
  /** Language of the content, ISO-ish ('en', 'es', 'pt'). */
  contentLanguage?: string
  learningMode?: LearningMode
  tool?: LearningTool
  relatedProjectId?: ID
  /** Default 'concluido'. Only 'concluido' / 'iniciado' sessions count minutes. */
  status?: StudySessionStatus
  /** Why / for what ("preparação para reunião (não reunião realizada)"). */
  context?: string
  /** What shows it was applied ("usei na reunião de 10/11"). */
  evidence?: string
  /** Pages read, when she says so. */
  pages?: number
  goalIds?: ID[]
  /** Calendar entry id (e.g. 'school:<trip>:<date>') or CalendarEvent id it was part of. */
  linkedEventId?: ID
  linkedTaskId?: ID
  source: 'app' | 'retroativo' | 'importado' | 'aula' | 'lumos'
  notes?: string
  learned?: string
}

export type ReviewCardStatus = 'novo' | 'em_pratica' | 'consolidando' | 'dominado_provisorio' | 'revisar'

/**
 * A review card (collection `learningErrors`, name kept): a mistake to fix ('erro': front = what she said,
 * back = the correction) or a concept to memorize ('conceito': front = question, back = answer), any domain.
 * Only things she chose to memorize — reflections never become cards on their own.
 */
export interface LearningError extends Entity {
  /** Default 'erro'. */
  kind?: 'erro' | 'conceito'
  /** Domain id; missing = 'idiomas' when trackId is set. */
  domain?: string
  trackId?: ID
  front: string
  back: string
  explanation?: string
  /** Free grouping ("verbos", "preposições", "patrística"). */
  category?: string
  /** Session it came from. */
  sessionId?: ID
  firstSeen: DateKey
  lastSeen: DateKey
  /** Times it happened (impact). */
  count: number
  status: ReviewCardStatus
  nextReview: DateKey
  intervalDays: number
  ease: number
  /** Consecutive successful spaced reviews. */
  streak?: number
  lastReviewed?: DateKey
  source?: string
}
export type ReviewCard = LearningError

export interface LearningPlan {
  /** Share of LANGUAGE time per language track (inside 'idiomas' only; never total study time). */
  split: Record<ID, number>
  /** Autonomous language minutes per week she aims for (classes not included). */
  weeklyAutonomousMin?: number
  /** Default 8. */
  maxReviewsPerDay?: number
  /**
   * Words that mean "this commitment happens in that language" (contact names, project names: 'Hillary', 'Bluemoon').
   * Missing = only explicit `language` fields and language words in titles count.
   */
  contextTerms?: { trackId: ID; terms: string[] }[]
}

export interface LearningTemplateStep {
  label: string
  minutes: number
  skills?: string[]
}

export interface LearningTemplate {
  id: ID
  name: string
  trackId?: ID
  domain?: string
  steps: LearningTemplateStep[]
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
  /** Where she is now ("Chapter 10 — Testing Assumptions"). */
  currentChapter?: string
  currentPage?: number
  totalPages?: number
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
  /** Expedição: day-by-day trip manager (school, budget in local currency, safety). Optional. */
  expedition?: TripExpedition
  /**
   * Modo viagem: on the trip's dates the São Paulo routine (training template, work, morning/evening
   * routines, meal plan, Luna, recurring local events) is paused. Default on; false = she turned it off.
   */
  pauseHomeRoutine?: boolean
}

// ─── Lugares que conheci ───────────────────────────────────────────────────

export type PlaceKind = 'pais' | 'estado' | 'cidade' | 'regiao' | 'ilha' | 'parque'
/** 'quero_ir' is a wish: it never counts as a place she knows. */
export type PlaceStatus = 'visitei' | 'moro' | 'quero_ir'

/**
 * A place she has been to, lives in or wants to know. Visiting a city/region implies its state (uf) and its
 * country count as visited — derived in data/places/model.ts, never stored twice.
 */
export interface Place extends Entity {
  name: string
  kind: PlaceKind
  /** ISO 3166-1 alpha-2 ('BR', 'PA', 'ZA'). */
  country: string
  /** Brazilian state code (incl. 'DF') when the place is in Brazil. */
  uf?: string
  /** The broader place it sits in (Salvador → Bahia), when she has it. */
  parentId?: ID
  status: PlaceStatus
  /** Free text ("2019", "jul/2023") or a DateKey. Never invented. */
  firstVisit?: string
  tripIds?: ID[]
  notes?: string
  favorite?: boolean
  source: 'marina' | 'seed' | 'lumos'
  order: number
}

/** How sure an item is. Shown as CONFIRMADO / ESTIMADO / DEPENDE DO CLIMA / PENDENTE. */
export type TripCertainty = 'confirmado' | 'estimado' | 'clima' | 'pendente'

/** Reservation pipeline (kept next to `status`/`paymentStatus`, which stay the source for older screens). */
export type TripBooking =
  | 'nao_pesquisado'
  | 'cotacao_solicitada'
  | 'aguardando'
  | 'confirmado'
  | 'pago'
  | 'concluido'
  | 'cancelado'

export type TripCurrency = 'ZAR' | 'BRL'

/**
 * Her status vocabulary (Atualização mestre 31/10) + PLANEJADO for activities without a voucher.
 * RESERVADO only with a voucher, proof or the supplier's confirmation (`voucherUrl`, `confirmationCode` or `proof`).
 * Kept in step with `status`/`booking` (see expedition/command.ts `bookingStatusPatch`).
 */
export type TripBookingStatus =
  | 'concluido'
  | 'reservado'
  | 'aguardando_resposta'
  /** Supplier answered; her payment / forms are what is missing (not booked yet). */
  | 'aguardando_pagamento'
  | 'a_cotar'
  | 'a_reservar'
  | 'opcional'
  | 'cancelado'
  | 'planejado'
  /** Reservation issued (reference in hand); the operation or the payment may still be pending. */
  | 'reserva_emitida'
  /** The supplier confirmed the details (date, time, pickup). */
  | 'confirmado'

export type TripPriority = 'P0' | 'P1' | 'P2'

/** Budget categories (section 13 of her master update). Missing = derived from the section. */
export type TripBudgetCategory =
  | 'hospedagem'
  | 'safari'
  | 'transfers'
  | 'tours'
  | 'alimentacao'
  | 'uber'
  | 'treinos'
  | 'compras'
  | 'presentes'
  | 'bagagem'
  | 'emergencia'

export type TripChecklistKind = 'trilha' | 'corrida' | 'natacao' | 'surf' | 'bike' | 'scuba' | 'safari' | 'voo' | 'voluntariado'

export interface TripSchool {
  name: string
  address?: string
  /** First and last class day. */
  from: DateKey
  until: DateKey
  /** Class hours per weekday (local time of the trip). */
  days: { weekday: Weekday; start: TimeHM; end: TimeHM }[]
  /** Days without class for everyone (holiday) — not an absence. */
  holidays?: { date: DateKey; label: string }[]
  /** Daily review she wants, as she wrote it ("15–20 minutos"). */
  reviewMinutes?: string
  /** What to practise (conversação, pronúncia…). */
  focus?: string[]
}

/** Trip-level settings of an Expedição. Every value is hers to edit; nothing here is fetched live. */
export interface TripExpedition {
  /** IANA zone of the activities' local times ('Africa/Johannesburg'). */
  timeZone: string
  currency: TripCurrency
  /** BRL for 1 unit of `currency`, as she typed it. No live rate. Missing = BRL not shown. */
  rateToBRL?: number
  /** Safety margin on the totals, in percent (15). */
  marginPct: number
  /**
   * Her original budget for the trip, in the trip currency (R30.000 rand → 3_000_000). A reference to compare against,
   * never a balance: what is left is always computed from what was paid/committed (expedition/ops.ts).
   */
  budgetCents?: number
  residence?: { name: string; address: string }
  school?: TripSchool
  emergencyContacts: Person[]
  /** Who receives the itinerary. */
  trustedContact?: Person
  /** Point for the optional forecast card (Open-Meteo, no key). */
  weather?: { lat: number; lon: number; label: string }
  safetyNotes?: string
  /**
   * The money she really has available (e.g. the Wise balance), as she typed it, in the trip currency.
   * Never computed and never assumed: without it the app says "não informado".
   */
  walletBalance?: TripWalletBalance
  /**
   * Documented conversions (a real exchange she made, e.g. the Wise conversion of 06/11): BRL paid for 1 unit
   * of the trip currency, with where it came from. Finanças shows a BRL equivalent only from these — the
   * latest by date, with its source. Never fetched live, never guessed.
   */
  fxRates?: TripFxRate[]
}

export interface TripFxRate {
  /** Day of the conversion. */
  date: DateKey
  /** BRL for 1 unit of the trip currency (1 ZAR = 0,30 BRL → 0.3). */
  brlPerUnit: number
  /** Where the rate is documented ("conversão Wise"). */
  source: string
}

export interface TripWalletBalance {
  cents: number
  /** Day she read the balance. */
  asOf: DateKey
  /** Where it came from ("app Wise"). */
  source?: string
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
  /** The external calendar event (Google eventId) that now represents this item on the calendar: the item keeps its data, the synced event is shown instead (no duplicate). */
  linkedExternalId?: string
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
  /** Booking reference / locator ("F59F-4976"), shown as "Referência". Counts as proof for RESERVADO. */
  confirmationCode?: string
  order: number
  /** Multi-day items (Safari 14–15/11). */
  endDate?: DateKey
  /** Payment is tracked separately from the plan; never inferred from an itinerary. */
  paymentStatus?: 'a_confirmar' | 'pendente' | 'pago' | 'nao_se_aplica'
  /** Language it happens in, when she says so (StudyTrack id). Used by Aprendizagem for meeting prep. */
  language?: ID

  // ── Expedição (all optional: items from before stay valid as they are) ──
  /** Missing = derived from `status` (confirmado/feito → confirmado, else pendente). */
  certainty?: TripCertainty
  /** Missing = derived from `status`/`paymentStatus` when they say enough. */
  booking?: TripBooking
  endTime?: TimeHM
  wakeTime?: TimeHM
  prepTime?: TimeHM
  leaveTime?: TimeHM
  returnTime?: TimeHM
  address?: string
  /** How she gets there — shown as "Transporte" ("Uber até Kloof Nek", "shuttle do operador"). */
  route?: string
  travelMinutes?: number
  /** Currency of the cost fields below. Missing = the trip's currency. */
  currency?: TripCurrency
  estimatedCents?: number
  quotedCents?: number
  paidCents?: number
  /** Uber/táxi, always apart from the activity cost. */
  uberCents?: number
  outfit?: string
  checklistKind?: TripChecklistKind
  /** Checklist lines she ticked (by text). */
  checked?: string[]
  contact?: string
  voucherUrl?: string
  supplier?: string
  cancellationPolicy?: string
  /** Pickup point/time as known ("estimado 05:30–06:30"). */
  pickup?: string
  needsPickup?: boolean
  pickupConfirmed?: boolean
  risk?: string
  planB?: string
  /** What it does to the class day: part of it or the whole day. */
  schoolImpact?: 'parcial' | 'dia'
  /** The class missed because of this item was made up. */
  schoolMadeUp?: boolean
  /** Medical clearance (bungee, mergulho). Missing = not needed. */
  clearance?: 'pendente' | 'liberada' | 'nao_liberada'
  /** Extra outside the base plan (shown with its opportunity cost, never as done without confirmation). */
  optional?: boolean
  opportunityCost?: string
  /** Can move to another day/time (replanning only suggests these). */
  flexible?: boolean
  indoor?: boolean
  /** Why it was cancelled; weather reasons bring replanning suggestions. */
  cancelReason?: 'vento' | 'chuva' | 'mar' | 'outro'
  /** Community activity: educational visit vs. volunteer work. */
  volunteer?: 'visita_educativa' | 'voluntariado'

  // ── Command center (Atualização mestre 31/10) ──
  /** Her status vocabulary. Missing = derived from status/booking (expedition/command.ts `bookingStatusOf`). */
  bookingStatus?: TripBookingStatus
  priority?: TripPriority
  category?: TripBudgetCategory
  nextAction?: string
  /** Deadline to resolve it. */
  deadline?: DateKey
  /** Supplier's confirmation in words ("e-mail da Cape Velo de 02/11") when there is no voucher link. */
  proof?: string
  /** Caveat shown next to the status ("sujeito à conferência do bilhete"). */
  caveat?: string
  /** Shopping: who it is for. */
  person?: string
  /** No class that day and she has not said whether it was an absence (shown "a confirmar"). */
  schoolToConfirm?: boolean
  /** Where the information came from ("e-mail do operador 06/11", "WhatsApp"). Shown as "Fonte". */
  source?: string
  /**
   * Her retag: what this item IS (reunião, tarefa, reserva…). Missing = derived (data/calendar/kind.ts).
   * Booking vocabulary (A COTAR, RESERVA EMITIDA, pagamento…) only applies to 'reserva'.
   */
  entryKind?: EntryKind
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
  /** Series / creator project (e.g. the South Africa series). */
  projectId?: ID
  links: Link[]
  order: number
  /** UGC Business: the brand whose product it shows. */
  brandId?: ID
  /** UGC Business: a demonstration video for her portfolio — NOT a paid contract. */
  demo?: UgcDemo
}

/** Portfolio / demo project: her own production with a product she has. Never revenue. */
export interface UgcDemo {
  product: string
  scenes: TaskStep[]
  recordDate?: DateKey
  /** Where the raw/edited files are (optional — nothing has to be uploaded). */
  files?: string
  editStatus: 'nao_iniciada' | 'editando' | 'revisao' | 'pronta'
  finalVersion?: string
  inPortfolio: boolean
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

// ─── UGC Business OS (Brand ≠ Opportunity) ──────────────────────────────────

/** A true fact about a brand, with where it came from — the only material a pitch may cite. */
export interface BrandFact {
  text: string
  source: 'marina' | 'site' | 'instagram' | 'print' | 'outro'
  sourceUrl?: string
  capturedAt: ISODateTime
  verified: boolean
}

export type UgcChannel = 'dm' | 'email' | 'formulario' | 'linkedin' | 'whatsapp'
export type BrandTier = 'S' | 'A' | 'B' | 'C'

/** The company, once. Everything optional but the name: the CRM works with an incomplete card. */
export interface Brand extends Entity {
  name: string
  category?: string
  subcategory?: string
  website?: string
  instagram?: string
  linkedin?: string
  country?: string
  /** City of the brand (or of the contact), when known ("Cape Town", "São Paulo"). */
  city?: string
  // who the brand is (Entrega 2 reads these)
  positioning?: string
  toneOfVoice?: string
  products?: string[]
  audience?: string
  visualIdentity?: string
  purpose?: string
  values?: string[]
  differentiators?: string[]
  creatorFitNotes?: string
  // her relationship with it — undefined = not known yet (never assumed)
  relationshipStatus?: 'nenhuma' | 'cliente' | 'ex_cliente' | 'parceira' | 'ex_parceira' | 'afiliada'
  alreadyCustomer?: boolean
  alreadyUsedProduct?: boolean
  productsUsed?: string[]
  howDiscovered?: string
  relationshipNotes?: string
  sizeTier?: 'pequena' | 'media' | 'grande'
  priorityTier?: BrandTier
  contactChannels?: { channel: UgcChannel; value: string }[]
  knownContacts?: { name: string; role?: string; email?: string; instagram?: string; linkedin?: string; whatsapp?: string }[]
  personalizationFacts?: BrandFact[]
  avoidTopics?: string[]
  tags?: string[]
  notes?: string
  /** No longer a target ("não faz mais sentido") — kept for history, out of every queue. */
  archived?: boolean
  /** Other spellings of the same company (explicit — never guessed from a look-alike name). */
  aliases?: string[]
  /** CRM Marcas: relationship status and history (press kits, coupons) — separate from paid UGC deals. */
  crm?: BrandCrm
}

export type UgcCrmStatus = 'prospect_pago' | 'aguardando_retorno' | 'aguardando_resposta' | 'negociacao' | 'press_kit' | 'afiliada_sem_vagas' | 'negativa'

export interface BrandCoupon {
  /** Code when known; a confirmed coupon whose code wasn't given stays without one (never invented). */
  code?: string
  source?: string
  notes?: string
}

export interface BrandCrm {
  status?: UgcCrmStatus
  /** Day of the evidence behind the status — a newer status (hers) is never overwritten by an older one. */
  statusAt?: DateKey
  evidence?: string
  /** No automatic commercial follow-up (affiliate without openings, confirmed negative). */
  noFollowUp?: boolean
  affiliate?: boolean
  /** In the paid-UGC prospect list (not contacted until a real send is recorded). */
  paidProspect?: boolean
  /** Relationship history — never payment. */
  pressKits?: { receivedAt?: DateKey; notes?: string }[]
  coupons?: BrandCoupon[]
}

export type UgcStage = 'prospectar' | 'contatada' | 'conversa' | 'producao' | 'entregue' | 'fechada'
export type UgcStatus = 'aberta' | 'aguardando_resposta' | 'negociando' | 'pausada' | 'sem_resposta' | 'recusada' | 'perdida' | 'concluida'
export type UgcDealType = 'ugc' | 'permuta' | 'campanha_paga' | 'afiliado' | 'embaixadora' | 'evento' | 'press_kit' | 'programa_creators'

/** One attempt / deal with a brand. A brand can have many over the years. */
export interface UgcOpportunity extends Entity {
  brandId: ID
  /** Project it belongs to (UGC, Fashion Finder…). Missing = sem projeto. */
  projectId?: ID
  title: string
  type?: UgcDealType
  stage: UgcStage
  status: UgcStatus
  primaryChannel?: UgcChannel
  objective?: string
  pitchAngle?: string
  proposedDeliverables?: string
  estimatedValueCents?: number
  agreedValueCents?: number
  compensationType?: 'dinheiro' | 'permuta' | 'misto' | 'comissao'
  usageRights?: string
  exclusivity?: string
  firstContactAt?: DateKey
  lastContactAt?: DateKey
  /** When to write again (cadence D+3 / D+7 / D+15, then reactivation). Undefined = nothing to chase. */
  nextFollowUpAt?: DateKey
  /** Last day of the follow-up window that starts at nextFollowUpAt (e.g. 18–21/10). */
  followUpWindowEnd?: DateKey
  /** How many follow-ups were sent in the current cadence. */
  followUpStep?: number
  /** Day the current cadence counts from (first contact, or her last message after a reply). */
  cadenceFrom?: DateKey
  responseReceivedAt?: DateKey
  proposalSentAt?: DateKey
  negotiationStartedAt?: DateKey
  agreedAt?: DateKey
  deliveredAt?: DateKey
  paidAt?: DateKey
  lostReason?: string
  /** Entrega 3: qualitative first, explained. */
  opportunityScore?: { priority?: BrandTier; response?: 'alta' | 'media' | 'baixa'; close?: 'alta' | 'media' | 'baixa' }
  scoreExplanation?: string[]
  notes?: string
}

/** Every contact, both ways — the statistics come from here, never typed by hand. */
export interface UgcInteraction extends Entity {
  brandId: ID
  opportunityId?: ID
  channel: UgcChannel
  direction: 'out' | 'in'
  type: 'primeiro_contato' | 'follow_up' | 'resposta' | 'proposta' | 'reuniao' | 'mensagem'
  content?: string
  sentAt: ISODateTime
  /** Day it happened (Sao Paulo). */
  date: DateKey
  /** What the opportunity looked like before this contact (unticking it on Home restores exactly that). */
  revert?: Record<string, unknown>
}

/** Entrega 2 (message engine): drafts and what was really sent — the structure exists from day one. */
export interface UgcMessage extends Entity {
  brandId: ID
  opportunityId?: ID
  channel: UgcChannel
  strategy?: string
  relevantContext?: string[]
  avoidedContext?: string[]
  brandFactsUsed?: string[]
  generatedText?: string
  approvedText?: string
  sentText?: string
  status: 'rascunho' | 'aprovada' | 'enviada' | 'descartada'
  sentAt?: ISODateTime
}

/** Who Marina is for brands — only what she stated. Context, not a checklist for every pitch. */
export interface CreatorProfile {
  name: string
  instagram?: string
  portfolio?: string
  positioning: string[]
  contexts: string[]
}

export interface UgcPrefs {
  /** New brands approached per weekday. */
  dailyNew: number
  weeklyNew: number
  /** Follow-up cadence in days after the first contact (D+3, D+7, D+15). */
  cadence: number[]
  /** After the last follow-up with no answer: try again after this many days. */
  reactivateDays: number
}

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
  /** Moved into the UGC Business OS (Brand + Opportunity): this record is history only. */
  ugcOpportunityId?: ID
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
  /** Missing = the life review. 'carreira' = Executive Career Review. */
  kind?: 'vida' | 'carreira'
  /** Executive Career Review answers (her six questions). */
  career?: { advanced?: string; opportunities?: string; skills?: string; results?: string; blocked?: string; priorities?: string[] }
  highlights: string[]
  notes?: string
  takeForward?: string
  completedAt?: ISODateTime
}

// ─── Planning ───────────────────────────────────────────────────────────────

/**
 * A rule the planner checks (it never blocks, it only warns).
 * - max_checkins_per_day: e.g. "TotalPass — 1 check-in/dia" for the listed modalities.
 * - max_minutes_per_day: e.g. "Yoga App — até 1h/dia" for a project's tasks/blocks.
 */
export interface SchedulingConstraint extends Entity {
  name: string
  kind: 'max_checkins_per_day' | 'max_minutes_per_day'
  limit: number
  /** Modalities that consume the check-in. */
  modalities?: string[]
  projectId?: ID
  active: boolean
  notes?: string
}

/** One line of the editable weekly training template ("SEG · 🏃 corrida · BASE"). */
export interface WeekTemplateItem extends Entity {
  weekday: Weekday
  /** One modality, or options to choose from (QUI: bike OU corrida; SÁB: fun day). */
  modalities: string[]
  /** fixed = this modality; one_of = pick one; optional = possible, not expected; rest = OFF/recovery. */
  choice: 'fixed' | 'one_of' | 'optional' | 'rest'
  title?: string
  time?: TimeHM
  period?: DayPeriod
  durationMin?: number
  planType: PlanType
  notes?: string
  order: number
  active: boolean
  /** Training-load fields copied into the workout when materialized. */
  durationMaxMin?: number
  sessionType?: SessionType
  loadCategory?: LoadCategory
  isKeySession?: boolean
  isLongSession?: boolean
  requiresPreviousDayPrep?: boolean
  requiresPreWorkout?: boolean
  requiresIntraWorkout?: boolean
  requiresPostWorkout?: boolean
  recoveryPriority?: 'normal' | 'alta'
  tags?: string[]
}

/** Marina's decision about a detected conflict (never auto-resolved). */
export interface ConflictAck extends Entity {
  /** Stable conflict key from data/planning.ts. */
  key: string
  decision: 'manter' | 'ignorar'
  date: DateKey
}

/** "Montar minha semana" result for a week. */
export interface WeekPlan extends Entity {
  weekStart: DateKey
  confirmedAt?: ISODateTime
  notes?: string
}

// ─── Bíblia, Graça & Liberdade ──────────────────────────────────────────────

/** Derived from its sessions (see data/spiritual/model.ts) — never stored as a separate truth. */
export type SpiritualPlanStatus = 'nao_iniciado' | 'em_andamento' | 'concluido'
export type SpiritualSessionStatus = 'pendente' | 'em_andamento' | 'concluido'

/** A visual group of sessions inside a plan, by session sortOrder (inclusive). */
export interface SpiritualBlock {
  title: string
  from: number
  to: number
}

/** A reading plan (a book or a theme). New plans/sessions are data: no code change needed. */
export interface SpiritualPlan extends Entity {
  title: string
  description?: string
  bookOrTheme: string
  sortOrder: number
  startedAt?: ISODateTime
  completedAt?: ISODateTime
  blocks?: SpiritualBlock[]
  /** A quiet note shown on the plan (e.g. "textos complementares"). */
  note?: string
}

/** One study (usually one chapter). Its check is THE done-state — the Home reads this same record. */
export interface SpiritualSession extends Entity {
  planId: ID
  scriptureReference: string
  chapterNumber?: number
  title: string
  sortOrder: number
  estimatedMinutes: number
  status: SpiritualSessionStatus
  /** Unknown for studies done before the app (left empty, never invented). */
  completedAt?: ISODateTime
  /** Marked done when it came in (studied before the app). */
  importedDone?: boolean
  /** A complementary text inside a plan (e.g. Mateus 5–7 next to Lucas). */
  complementary?: boolean
  /** A quiet fact about how it was confirmed (e.g. "leitura confirmada por foto"). Never a reflection. */
  doneNote?: string
}

/** The ten parts of a guided study (Estudar com IA). */
export interface BibleStudyContent {
  temaCentral: string
  contextoHistorico: string
  explicacao: string
  contextoTeologico: string
  olharProgressista: string
  leituraContemplativa: string
  aplicacaoPessoal: string
  perguntas: string[]
  oracao: string
  fraseDoDia: string
}

export interface SpiritualStudy extends Entity {
  sessionId: ID
  content: BibleStudyContent
  /** 'lumos' = Estudar com IA; 'importado' = pasted via "Importar estudo" (fields she didn't import stay ''). */
  contentSource: 'lumos' | 'importado'
  generatedAt: ISODateTime
  /** Her notes/transcription sent along (kept so she knows what the study was based on). */
  userNotes?: string
}

/** Her notebook for a session. Survives unchecking the session. */
export interface SpiritualJournalEntry extends Entity {
  sessionId: ID
  planId: ID
  reference: string
  /** O que este texto revela sobre Deus? */
  reflectionGod?: string
  /** O que revela sobre o ser humano? */
  reflectionHumanity?: string
  /** O que isso desperta em mim? */
  personalReflection?: string
  keyword?: string
  prayer?: string
  notes?: string
}

export interface SpiritualImportLog {
  at: ISODateTime
  sessionId: ID
  reference: string
  /** Import field keys actually written. */
  fields: string[]
  /** Fingerprint of session + payload (the same paste is recognised as already imported). */
  hash: string
}

export type SpiritualPrayerCategory = 'oracao' | 'intencao' | 'gratidao' | 'reflexao'

export interface SpiritualPrayer extends Entity {
  title?: string
  content: string
  category: SpiritualPrayerCategory
}

// ─── Ateliê Literário (private: never synced, always in her backup) ────────

/** Editorial state. "Versão final aprovada" only after SHE approves a version in the app. */
export type LiteraryStatus = 'ideia' | 'rascunho' | 'lapidacao' | 'final_aprovada' | 'publicado' | 'arquivado'
/**
 * A version that exists OUTSIDE the app and was identified, but whose approval she has not confirmed here.
 * Never the same thing as `final_aprovada`.
 */
export type LiteraryProvenance = 'versao_anterior' | 'versao_final_anterior' | 'versao_trabalhada'
/** How a piece started. 'acervo' = registered from her existing work. */
export type LiteraryOrigin = 'livre' | 'fragmento' | 'imagem' | 'experiencia' | 'tema' | 'exercicio' | 'acervo'

export interface LiteraryWork extends Entity {
  title: string
  /** "título provisório". */
  provisionalTitle?: boolean
  subtitle?: string
  /** What she knows about when it was written, in her words ("jul/2026 (dia a confirmar)", "data a confirmar"). */
  dateLabel?: string
  /** Only when the exact day is known. */
  date?: DateKey
  /** Partial reference when only the month is known ('2026-07'). */
  month?: string
  genre?: string
  status: LiteraryStatus
  /** Her original words for the status when registering the work ("em desenvolvimento"). */
  statusNote?: string
  provenance?: LiteraryProvenance
  provenanceNote?: string
  themes: string[]
  /** Recurring images and symbols (tags she controls). */
  symbols: string[]
  /** A sentence about the central image, when there is one. */
  centralImage?: string
  /** The idea / concept behind the piece (not the text). */
  concept?: string
  collectionIds: ID[]
  authorNotes?: string
  creationContext?: string
  publishedAt?: DateKey
  publishedLink?: string
  /** No full text in the app yet (only a record). Never filled by reconstructing from excerpts. */
  textPending: boolean
  /** Short known passages, kept as excerpts — never as the text. */
  excerpts: string[]
  favoriteVersionId?: ID
  approvedVersionId?: ID
  origin?: LiteraryOrigin
  /** Laboratório: which exercise started it, and what she learned. */
  exerciseId?: string
  learned?: string
  /** Last time the text itself changed. */
  lastEditedAt?: ISODateTime
  source: 'seed' | 'marina'
}

/** One recoverable state of a text. Approved versions are frozen (never edited, never removed by the app). */
export interface LiteraryVersion extends Entity {
  workId: ID
  body: string
  note?: string
  wordCount: number
  source: 'marina'
  favorite?: boolean
  /** The working draft autosave may keep updating. A checkpoint (save / leaving the editor) clears it. */
  draft?: boolean
  approvedAt?: ISODateTime
  restoredFromId?: ID
}

export interface LiteraryCollection extends Entity {
  name: string
  description?: string
  themes: string[]
  /** Ordered. */
  workIds: ID[]
  source: 'seed' | 'marina'
}

/** Her author profile (editable). Development points feed one optional suggestion — never a task. */
export interface LiteraryAuthorProfile extends Entity {
  identity: string
  strengths: string[]
  developmentPoints: string[]
  goal: string
  /** Development points she chose not to see as suggestions. */
  dismissedTips?: string[]
  source: 'seed' | 'marina'
}

// ─── Meu Universo (biblioteca pessoal: perfumes primeiro) ───────────────────

/** Shelves of her personal library. 'fragrancia' = a fragrance whose type (perfume, splash, hidratante…) is still to confirm. */
export type UniverseCategory =
  | 'perfume'
  | 'body_splash'
  | 'hidratante'
  | 'oleo_corporal'
  | 'fragrancia'
  | 'maquiagem'
  | 'skincare'
  | 'cabelo'
  | 'roupa'
  | 'acessorio'
  | 'marca'
  | 'lugar'
  | 'cafe'
  | 'restaurante'
  | 'equipamento'
  | 'outro'

/**
 * Where the item stands in HER life — never an opinion. Owned = 'tenho' | 'em_uso' | 'comprado'.
 * 'testado' / 'quero_testar' / 'desejo' are never shown as hers.
 */
export type UniverseOwnership = 'tenho' | 'em_uso' | 'comprado' | 'acabou' | 'nao_recomprar' | 'testado' | 'quero_testar' | 'desejo'

/** What she thinks — separate from owning (loving it doesn't mean she has it). */
export type UniverseOpinion = 'amei' | 'gostei' | 'indiferente' | 'nao_gostei'

/** Where the notes come from: the product's documented notes, her own impression, or still to confirm. */
export type UniverseNotesSource = 'documentado' | 'impressao' | 'a_confirmar'

/** Usual occasions (habits, not restrictions). */
export type UniverseOccasion =
  | 'dia'
  | 'noite'
  | 'frio'
  | 'calor'
  | 'trabalho'
  | 'reuniao'
  | 'cotidiano'
  | 'encontro'
  | 'romance'
  | 'lazer'
  | 'praia'
  | 'viagem'
  | 'social'
  | 'elegante'

export interface UniverseItem extends Entity {
  category: UniverseCategory
  name: string
  brand?: string
  /** Version / concentration ("EDP", "Intense"). */
  version?: string
  ownership: UniverseOwnership
  opinion?: UniverseOpinion
  /** Only she marks a favorite. */
  favorite?: boolean
  /** Profile / olfactory families as she described them ("floral âmbar"). */
  families?: string[]
  notes?: string[]
  notesSource?: UniverseNotesSource
  /** Characteristics in her words ("Floral cremoso e envolvente"). */
  description?: string
  occasions?: UniverseOccasion[]
  /** Occasion in her words ("Lazer em dias frios, encontros, noites elegantes"). */
  occasionText?: string
  /** Integer cents in `currency`. */
  priceCents?: number
  /** ISO 4217 ('BRL', 'ZAR', 'USD', 'EUR'). */
  currency?: string
  sizeMl?: number
  country?: string
  city?: string
  store?: string
  /** First time she tried it. */
  experiencedOn?: DateKey
  acquiredOn?: DateKey
  remaining?: 'cheio' | 'mais_da_metade' | 'metade' | 'pouco' | 'vazio'
  rebuy?: 'sim' | 'talvez' | 'nao'
  /** Wishlist order inside its group (1 = first). */
  wishPriority?: number
  wishGroup?: string
  /** Small JPEG data URL (optional). */
  photo?: string
  observations?: string
  source: 'seed' | 'marina' | 'lumos'
  /** false = something about it still needs her confirmation (see needsConfirmation). */
  confirmed: boolean
  /** Which fields to confirm: 'versao' | 'categoria' | 'marca' | 'notas' | 'volume' | 'duracao' | 'data'… */
  needsConfirmation?: string[]
  order: number
}

export type ScentLogStatus = 'quero_testar' | 'testado' | 'wishlist' | 'comprado' | 'em_uso' | 'terminado' | 'nao_recomprar'

/** One olfactory experience (diário olfativo). Everything but the item and the date is optional. */
export interface ScentLog extends Entity {
  itemId: ID
  date: DateKey
  city?: string
  country?: string
  concentration?: string
  testedOn?: 'papel' | 'pele'
  firstImpression?: string
  after30min?: string
  after2h?: string
  after6h?: string
  /** 1–5 each. */
  sweetness?: number
  freshness?: number
  creaminess?: number
  intensity?: number
  comfort?: number
  projection?: string
  duration?: string
  idealOccasion?: string
  /** 0–10. */
  score?: number
  verdict?: UniverseOpinion
  wouldBuy?: 'sim' | 'talvez' | 'nao'
  priceCents?: number
  currency?: string
  sizeMl?: number
  status?: ScentLogStatus
  notes?: string
  source: 'seed' | 'marina' | 'lumos'
  confirmed: boolean
  needsConfirmation?: string[]
}

/** Her olfactory profile and beauty taste (editable in Meu Universo → DNA). */
export interface ScentProfile {
  summary?: string
  familiesLiked: string[]
  familiesLess: string[]
  notesOfInterest: string[]
  /** "Não são regras absolutas…" */
  remarks?: string
  makeupStyle?: string
}

// ─── Cuidar de Mim (private: never Supabase; owner-only store like the Ateliê; in her backup) ───

/** How a technique sits with her. No scores, no ratings. */
export type CarePreference = 'ajuda' | 'às vezes' | 'não pra mim'

/** One per technique (id = `care-pref:<techniqueId>`). The techniques themselves are static content. */
export interface CareTechniquePref extends Entity {
  techniqueId: string
  favorite: boolean
  preference?: CarePreference
  /** Only when she taps "registrar que usei" (never automatic). ISO timestamps, newest last. */
  usedAt: ISODateTime[]
}

export type PauseContext = 'pessoal' | 'relacionamento' | 'amizade' | 'familia' | 'profissional' | 'whatsapp' | 'instagram' | 'email'
export type PauseIntent = 'tempo' | 'nao_consigo_agora' | 'retomar_amanha' | 'falar_com_calma' | 'limite' | 'nao_decidir_agora' | 'pedir_apoio'
export type PauseTone = 'delicado' | 'neutro' | 'objetivo' | 'profissional'

/** A pause message she chose to keep. Nothing is ever sent by the app. */
export interface CarePauseDraft extends Entity {
  context: PauseContext
  intent: PauseIntent
  tone: PauseTone
  text: string
}

export interface CareSupportContact {
  name: string
  phone?: string
  note?: string
}

/** Her voluntary support plan (singleton, id = `care-support-plan`). Every field optional. */
export interface CareSupportPlan extends Entity {
  contacts: CareSupportContact[]
  warningSigns?: string
  whatHelps?: string
  safePlaces?: string
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
  studySessions: StudySession[]
  learningErrors: LearningError[]
  books: Book[]

  trips: Trip[]
  tripItems: TripItem[]
  places: Place[]

  contentItems: ContentItem[]
  partnerships: BrandPartnership[]

  notes: Note[]
  brainDump: BrainDumpItem[]

  pets: Pet[]
  petTasks: PetTask[]

  weeklyReviews: WeeklyReview[]
  monthlyReviews: MonthlyReview[]

  integrations: IntegrationConnection[]

  constraints: SchedulingConstraint[]
  weekTemplate: WeekTemplateItem[]
  conflictAcks: ConflictAck[]
  weekPlans: WeekPlan[]

  nutritionStrategies: NutritionStrategy[]
  nutritionDayPlans: NutritionDayPlan[]
  bodyComposition: BodyComposition[]

  scheduleOverrides: ScheduleOverride[]
  foods: FoodItem[]
  mealAdjustments: MealAdjustment[]
  mealPrepPlans: MealPrepPlan[]
  pantry: PantryItem[]
  memory: MemoryItem[]
  lifeLog: LifeEvent[]
  attentionAcks: AttentionAck[]
  contracts: FinancialContract[]
  opportunities: Opportunity[]
  contacts: ProfessionalContact[]
  execPosts: ExecPost[]
  backlogItems: BacklogItem[]
  importBatches: ImportBatch[]
  brands: Brand[]
  ugcOpportunities: UgcOpportunity[]
  ugcInteractions: UgcInteraction[]
  ugcMessages: UgcMessage[]
  spiritualPlans: SpiritualPlan[]
  spiritualSessions: SpiritualSession[]
  spiritualStudies: SpiritualStudy[]
  spiritualJournal: SpiritualJournalEntry[]
  spiritualPrayers: SpiritualPrayer[]
  literaryWorks: LiteraryWork[]
  literaryVersions: LiteraryVersion[]
  literaryCollections: LiteraryCollection[]
  literaryProfile: LiteraryAuthorProfile[]
  universeItems: UniverseItem[]
  scentLogs: ScentLog[]
  careTechniquePrefs: CareTechniquePref[]
  carePauseDrafts: CarePauseDraft[]
  careSupportPlan: CareSupportPlan[]
  /** Check-in do dia + changes of the "O que faz sentido agora?" plan (priority engine). */
  dayCheckins: DayCheckin[]
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
  | 'brand'
  | 'ugcOpportunity'
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
  | 'studySession'
  | 'learningError'
  | 'book'
  | 'trip'
  | 'tripItem'
  | 'place'
  | 'content'
  | 'partnership'
  | 'note'
  | 'brainDump'
  | 'pet'
  | 'petTask'
  | 'weeklyReview'
  | 'monthlyReview'
  | 'opportunity'
  | 'contact'
  | 'contract'
  | 'spiritualSession'
  | 'universeItem'
  | 'scentLog'

export const ENTITY_COLLECTION: Record<EntityType, CollectionKey> = {
  brand: 'brands',
  ugcOpportunity: 'ugcOpportunities',
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
  studySession: 'studySessions',
  learningError: 'learningErrors',
  book: 'books',
  trip: 'trips',
  tripItem: 'tripItems',
  place: 'places',
  content: 'contentItems',
  partnership: 'partnerships',
  note: 'notes',
  brainDump: 'brainDump',
  pet: 'pets',
  petTask: 'petTasks',
  weeklyReview: 'weeklyReviews',
  monthlyReview: 'monthlyReviews',
  opportunity: 'opportunities',
  contact: 'contacts',
  contract: 'contracts',
  spiritualSession: 'spiritualSessions',
  universeItem: 'universeItems',
  scentLog: 'scentLogs',
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
