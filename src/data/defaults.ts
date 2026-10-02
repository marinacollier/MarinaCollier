/**
 * Defaults that are part of the platform contract (not feature seeds):
 * profile, modalities, financial categories and an empty DB.
 */
import type { DB, FinancialCategory, Modality, UserProfile } from './types'

export const SCHEMA_VERSION = 1

export const DEFAULT_MODALITIES: Modality[] = [
  { id: 'corrida', label: 'Corrida', emoji: '🏃‍♀️', tone: 'accent', favorite: true, active: true, hasDistance: true },
  { id: 'trail', label: 'Trail run', emoji: '⛰️', tone: 'sage', favorite: true, active: true, hasDistance: true },
  { id: 'natacao', label: 'Natação', emoji: '🏊‍♀️', tone: 'ocean', favorite: true, active: true, hasDistance: true },
  { id: 'bike', label: 'Bike', emoji: '🚴‍♀️', tone: 'sand', favorite: true, active: true, hasDistance: true },
  { id: 'gravel', label: 'Gravel', emoji: '🚵‍♀️', tone: 'sand', favorite: true, active: true, hasDistance: true },
  { id: 'speed', label: 'Speed', emoji: '🚴', tone: 'sand', favorite: false, active: true, hasDistance: true },
  { id: 'musculacao', label: 'Musculação', emoji: '🏋️‍♀️', tone: 'ink', favorite: true, active: true, hasDistance: false },
  { id: 'yoga', label: 'Yoga', emoji: '🧘‍♀️', tone: 'plum', favorite: true, active: true, hasDistance: false },
  { id: 'mobilidade', label: 'Mobilidade', emoji: '🤸‍♀️', tone: 'plum', favorite: true, active: true, hasDistance: false },
  { id: 'surf', label: 'Surf', emoji: '🏄‍♀️', tone: 'ocean', favorite: true, active: true, hasDistance: false },
  { id: 'recuperacao', label: 'Recuperação', emoji: '🌿', tone: 'sage', favorite: false, active: true, hasDistance: false },
  { id: 'outro', label: 'Outra atividade', emoji: '✨', tone: 'ink', favorite: false, active: true, hasDistance: false },
]

const CATEGORY_SEED: [string, string, FinancialCategory['tone']][] = [
  ['Casa', '🏡', 'sand'],
  ['Mercado', '🛒', 'sage'],
  ['Restaurante', '🍽️', 'accent'],
  ['Transporte', '🚗', 'ink'],
  ['Luna', '🐾', 'sand'],
  ['Esporte', '🏃‍♀️', 'accent'],
  ['Viagem', '✈️', 'ocean'],
  ['Beleza', '💄', 'plum'],
  ['Autocuidado', '🌿', 'sage'],
  ['Educação', '📚', 'ocean'],
  ['Trabalho', '💻', 'ink'],
  ['Lazer', '🎟️', 'accent'],
  ['Compras', '🛍️', 'plum'],
  ['Assinaturas', '🔁', 'ink'],
  ['Outros', '•', 'ink'],
]

/** Stable ids so imported transactions and seeds can reference categories: 'cat-casa', 'cat-mercado'... */
export function categoryId(name: string): string {
  return (
    'cat-' +
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
  )
}

export function defaultCategories(nowIso: string): FinancialCategory[] {
  return CATEGORY_SEED.map(([name, emoji, tone], i) => ({
    id: categoryId(name),
    createdAt: nowIso,
    updatedAt: nowIso,
    name,
    emoji,
    tone,
    order: i,
    archived: false,
  }))
}

export function defaultProfile(): UserProfile {
  return {
    name: 'Marina',
    timezone: 'America/Sao_Paulo',
    theme: 'system',
    homeWidgets: [
      { id: 'agora', visible: true },
      { id: 'top3', visible: true },
      { id: 'manha', visible: true },
      { id: 'treino', visible: true },
      { id: 'proximo_compromisso', visible: true },
      { id: 'tarefas', visible: true },
      { id: 'refeicoes', visible: true },
      { id: 'gastos', visible: true },
      { id: 'work_focus', visible: true },
      { id: 'waiting_for', visible: true },
      { id: 'proxima_viagem', visible: true },
      { id: 'lendo_agora', visible: true },
      { id: 'estudo_atual', visible: true },
      { id: 'luna', visible: true },
      { id: 'countdown', visible: false },
      { id: 'fechamento', visible: true },
    ],
    modules: (
      [
        'hoje',
        'agenda',
        'vida',
        'trabalho',
        'corpo',
        'dinheiro',
        'metas',
        'estudos',
        'livros',
        'viagens',
        'creator',
        'luna',
        'vida_real',
        'inbox',
        'revisao',
        'mes',
        'mari',
      ] as const
    ).map((id) => ({ id, visible: true })),
    modalities: DEFAULT_MODALITIES,
    notificationPrefs: [
      { category: 'compromisso', enabled: true, leadMinutes: 30 },
      { category: 'deadline', enabled: true },
      { category: 'treino', enabled: true, leadMinutes: 60 },
      { category: 'rotina', enabled: false },
      { category: 'viagem', enabled: true },
      { category: 'waiting_for', enabled: true },
      { category: 'revisao_semanal', enabled: true },
    ],
    featureFlags: {
      googleCalendarEnabled: false,
      microsoftCalendarEnabled: false,
      teamsEnabled: false,
      outlookMailEnabled: false,
      organizzeEnabled: false,
      icsEnabled: true,
      aiAssistantEnabled: false,
    },
    waterGoal: 8,
    dayParts: { morningStart: 4, middayStart: 11, eveningStart: 18 },
  }
}

export function emptyDB(): DB {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: defaultProfile(),
    tasks: [],
    occurrences: [],
    priorities: [],
    routines: [],
    routineItems: [],
    calendarSources: [],
    events: [],
    workouts: [],
    workoutGoals: [],
    meals: [],
    mealTemplates: [],
    checkins: [],
    expenses: [],
    financialAccounts: [],
    financialCategories: [],
    goals: [],
    projects: [],
    milestones: [],
    wins: [],
    workInbox: [],
    meetings: [],
    studyTracks: [],
    studyItems: [],
    books: [],
    trips: [],
    tripItems: [],
    contentItems: [],
    partnerships: [],
    notes: [],
    brainDump: [],
    pets: [],
    petTasks: [],
    weeklyReviews: [],
    monthlyReviews: [],
    integrations: [],
  }
}

/** Fill in anything missing from an older or partial DB (imports, schema bumps). */
export function migrate(raw: unknown): DB {
  const base = emptyDB()
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Partial<DB>
  const out = { ...base, ...input } as DB
  for (const key of Object.keys(base) as (keyof DB)[]) {
    if (Array.isArray(base[key]) && !Array.isArray(out[key])) (out as unknown as Record<string, unknown>)[key] = []
  }
  const dp = defaultProfile()
  const p = { ...dp, ...(input.profile ?? {}) }
  p.featureFlags = { ...dp.featureFlags, ...(input.profile?.featureFlags ?? {}) }
  p.dayParts = { ...dp.dayParts, ...(input.profile?.dayParts ?? {}) }
  // New widgets/modules added in later versions get appended (hidden widgets stay hidden).
  for (const w of dp.homeWidgets) if (!p.homeWidgets.some((x) => x.id === w.id)) p.homeWidgets.push(w)
  for (const m of dp.modules) if (!p.modules.some((x) => x.id === m.id)) p.modules.push(m)
  out.profile = p
  out.schemaVersion = SCHEMA_VERSION
  return out
}
