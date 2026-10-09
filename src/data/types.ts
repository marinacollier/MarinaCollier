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

export type OccurrenceParent = 'task' | 'routineItem' | 'petTask'

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

export type LockArea = 'dinheiro' | 'carreira'

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
  work: WorkSchedule
  /** Version of the life seed applied to this database (see data/seed/migrate.ts). */
  seedVersion?: number
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
  waiting?: { who: string; since: DateKey; followUpOn?: DateKey }
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
  /** Checklist template opened with the event (Weekly CEO Review topics). */
  template?: string[]
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
  currency?: 'BRL' | 'USD' | 'EUR'
  /** Who created it: a contract's monthly expectation, Marina by hand, Lumos, an integration. */
  source?: 'contrato' | 'manual' | 'lumos' | 'organizze'
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
  /** Work areas inside the project (Day One AI: Planner, Match, Smart Flight...). Tasks use Task.group. */
  sections?: string[]
  /** Content series tied to a trip ("Um mês sozinha na África do Sul"). */
  tripId?: ID
  /** Content categories for creator projects. */
  categories?: string[]
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
  /** Multi-day items (Safari 14–15/11). */
  endDate?: DateKey
  /** Payment is tracked separately from the plan; never inferred from an itinerary. */
  paymentStatus?: 'a_confirmar' | 'pendente' | 'pago' | 'nao_se_aplica'
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
