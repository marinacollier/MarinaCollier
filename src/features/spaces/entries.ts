/**
 * ESPAÇOS — "Onde encontro algo específico?" (pure + tested)
 *
 * Four groups (Corpo · Trabalho · Aprender · Vida). Each entry carries a tiny live hint and is
 * HIDDEN when its module has nothing in it ("Livros — 0" never appears). Work lists one entry per
 * real project from the data; names are never hardcoded. Modules Marina hid in Design stay hidden.
 */
import { ROUTES } from '@/app/routes'
import { areaLocked } from '@/app/lock-store'
import { contextWorkouts } from '@/data/fuel'
import { isTaskOpen, modalityOf, petTasksDue, readingNow, studyingNow, upcomingTrips, waitingFor } from '@/data/selectors'
import type { DateKey, DB, ModuleId, Tone } from '@/data/types'
import { addDays, diffDays } from '@/lib/date'
import { nextSession } from '@/data/spiritual/model'
import { collection, FRAGRANCE_CATEGORIES } from '@/data/universe/model'
import { isRadarItem } from '@/features/learning/radar'

export interface SpaceEntry {
  key: string
  label: string
  emoji: string
  to: string
  tone: Tone
  /** One short live line ("lendo: Continuous Discovery Habits"). */
  hint?: string
  module?: ModuleId
}

export interface SpaceGroup {
  key: 'corpo' | 'trabalho' | 'aprender' | 'vida'
  label: string
  /** Optional "ver tudo" destination (the old hub pages stay reachable). */
  all?: string
  entries: SpaceEntry[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function nextTraining(db: DB, today: DateKey): string | undefined {
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i)
    const w = contextWorkouts(db, date).find((x) => x.status === 'planejado')
    if (!w) continue
    const when = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : `em ${i} dias`
    return `${when} · ${w.title || modalityOf(db, w.modality).label}`
  }
  return undefined
}

function corpo(db: DB, today: DateKey): SpaceEntry[] {
  const out: SpaceEntry[] = []
  if (db.workouts.length || db.weekTemplate.length || db.workoutGoals.length)
    out.push({ key: 'treinos', label: 'Treinos', emoji: '🏃‍♀️', to: ROUTES.body, tone: 'accent', module: 'corpo', hint: nextTraining(db, today) })
  if (db.nutritionDayPlans.length || db.nutritionStrategies.length || db.meals.length)
    out.push({ key: 'nutricao', label: 'Nutrição', emoji: '🍽️', to: ROUTES.nutrition, tone: 'sage', module: 'corpo', hint: db.nutritionDayPlans.length ? 'plano da nutri' : undefined })
  const prepared = db.pantry.filter((p) => p.kind === 'preparado' && (p.remaining ?? p.portions ?? 0) > 0)
  if (db.mealPrepPlans.length || db.pantry.length || db.nutritionDayPlans.length) {
    const portions = prepared.reduce((s, p) => s + (p.remaining ?? p.portions ?? 0), 0)
    out.push({ key: 'mealprep', label: 'Meal prep', emoji: '🍱', to: ROUTES.mealPrep, tone: 'sand', module: 'corpo', hint: portions ? `${plural(portions, 'porção pronta', 'porções prontas')}` : undefined })
  }
  if (db.bodyComposition.length) out.push({ key: 'evolucao', label: 'Evolução', emoji: '🌿', to: ROUTES.bodyEvolution, tone: 'sage', module: 'corpo' })
  return out
}

function trabalho(db: DB, today: DateKey): SpaceEntry[] {
  const out: SpaceEntry[] = []
  const projects = db.projects.filter((p) => p.status !== 'concluido' && p.kind !== 'creator').sort((a, b) => a.order - b.order)
  for (const p of projects) {
    const open = db.tasks.filter((t) => t.projectId === p.id && isTaskOpen(t) && t.status !== 'waiting').length
    const d = p.nextDelivery?.date && p.nextDelivery.date >= today ? diffDays(today, p.nextDelivery.date) : undefined
    const hint =
      p.nextDelivery && d !== undefined && d <= 14
        ? `${p.nextDelivery.title} · ${d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`}`
        : p.nextAction || (open ? plural(open, 'coisa aberta', 'coisas abertas') : p.role)
    out.push({ key: `project:${p.id}`, label: p.name, emoji: p.emoji, to: ROUTES.project(p.id), tone: p.tone, hint })
  }
  const creator = db.projects.filter((p) => p.kind === 'creator' && p.status !== 'concluido')
  if (creator.length || db.contentItems.length || db.partnerships.length) {
    const ideas = db.contentItems.filter((c) => c.stage === 'ideia').length
    out.push({ key: 'creator', label: creator.find((p) => p.status === 'ativo')?.name ?? 'Creator / UGC', emoji: '🎬', to: ROUTES.creator, tone: 'plum', module: 'creator', hint: ideas ? plural(ideas, 'ideia', 'ideias') : undefined })
  }
  const north = db.goals.find((g) => g.level === 'maior' && g.category === 'profissional' && g.status === 'ativa')
  if (north || db.opportunities?.length) {
    const open = (db.opportunities ?? []).filter((o) => !['fechada', 'descartada'].includes(o.status)).length
    out.unshift({ key: 'career', label: 'Carreira 2027', emoji: '🧭', to: ROUTES.career, tone: 'accent', hint: open ? plural(open, 'oportunidade aberta', 'oportunidades abertas') : north ? 'North Star · semana' : undefined })
  }
  const waiting = waitingFor(db).length
  if (waiting) out.push({ key: 'waiting', label: 'Esperando retorno', emoji: '⏳', to: ROUTES.work, tone: 'ink', hint: plural(waiting, 'item', 'itens') })
  return out
}

function aprender(db: DB): SpaceEntry[] {
  const out: SpaceEntry[] = []
  const tracks = db.studyTracks.filter((t) => !t.archived && t.status !== 'pausado')
  const studyItems = db.studyItems.filter((s) => !s.reference)
  if (tracks.length || studyItems.length) {
    const now = studyingNow(db).filter((s) => !s.reference)[0]
    out.push({ key: 'estudos', label: 'Estudos', emoji: '📚', to: ROUTES.study, tone: 'ocean', module: 'estudos', hint: now ? now.title : tracks.length ? tracks.map((t) => t.name).slice(0, 3).join(' · ') : undefined })
  }
  if (db.books.length) {
    const reading = readingNow(db)[0]
    const done = db.books.filter((b) => b.status === 'finalizado').length
    out.push({ key: 'livros', label: 'Livros', emoji: '📖', to: ROUTES.books, tone: 'plum', module: 'livros', hint: reading ? `lendo: ${reading.title}` : done ? plural(done, 'lido', 'lidos') : undefined })
  }
  const refs = db.studyItems.filter((s) => (s.reference || s.kind === 'newsletter') && !isRadarItem(s))
  if (refs.length) out.push({ key: 'salvos', label: 'Conteúdos salvos', emoji: '🔖', to: ROUTES.saved, tone: 'sand', module: 'estudos', hint: refs.map((r) => r.source || r.title).slice(0, 2).join(' · ') })
  // Ateliê Literário: private writing. The hint is a count only (never a title or a line of text); nothing when locked.
  const works = db.literaryWorks ?? []
  if (works.length || db.literaryProfile?.length) {
    const lapidacao = works.filter((w) => w.status === 'lapidacao').length
    const hint = areaLocked(db.profile.privacyLock, 'atelie') ? undefined : lapidacao ? `${plural(lapidacao, 'escrita', 'escritas')} em lapidação` : works.length ? plural(works.length, 'obra', 'obras') : undefined
    out.push({ key: 'atelie', label: 'Ateliê Literário', emoji: '🖋️', to: ROUTES.atelie, tone: 'plum', hint })
  }
  return out
}

function vida(db: DB, today: DateKey): SpaceEntry[] {
  const out: SpaceEntry[] = []
  const trips = upcomingTrips(db, today)
  if (trips.length) {
    const t = trips[0]
    const d = t.startDate ? diffDays(today, t.startDate) : undefined
    out.push({ key: 'viagens', label: 'Viagens', emoji: '✈️', to: ROUTES.trips, tone: 'ocean', module: 'viagens', hint: d !== undefined && d >= 0 ? `${t.name} em ${plural(d, 'dia', 'dias')}` : t.name })
  } else if (db.trips.length) {
    // Past trips stay reachable after the last one ends.
    out.push({ key: 'viagens', label: 'Viagens', emoji: '✈️', to: ROUTES.trips, tone: 'ocean', module: 'viagens', hint: plural(db.trips.length, 'viagem', 'viagens') })
  }
  if (db.expenses.length || db.financialAccounts.length) {
    const planned = db.expenses.filter((e) => e.status === 'planned_purchase').length
    out.push({ key: 'financas', label: 'Finanças', emoji: '💸', to: ROUTES.money, tone: 'sage', module: 'dinheiro', hint: planned ? plural(planned, 'compra planejada', 'compras planejadas') : undefined })
  }
  if (db.pets.length) {
    const due = petTasksDue(db, today).length
    const pet = db.pets[0]
    out.push({ key: 'luna', label: db.pets.length === 1 ? pet.name : 'Pets', emoji: '🐾', to: ROUTES.luna, tone: 'sand', module: 'luna', hint: due ? `${plural(due, 'cuidado', 'cuidados')} hoje` : pet.breed })
  }
  if (db.spiritualPlans.length) {
    const next = nextSession(db)
    out.push({ key: 'biblia', label: 'Bíblia, Graça & Liberdade', emoji: '🕊️', to: ROUTES.bible, tone: 'plum', hint: next ? `próximo: ${next.scriptureReference}` : undefined })
  }
  const universe = db.universeItems ?? []
  if (universe.length) {
    const fragrances = collection(db, FRAGRANCE_CATEGORIES).length
    out.push({ key: 'universo', label: 'Meu Universo', emoji: '🌸', to: ROUTES.universe, tone: 'plum', hint: fragrances ? plural(fragrances, 'fragrância na coleção', 'fragrâncias na coleção') : 'beauty & fragrance' })
  }
  const admin = db.tasks.filter((t) => t.context === 'vida_real' && isTaskOpen(t))
  if (admin.length) out.push({ key: 'casa', label: 'Casa & admin', emoji: '🏡', to: ROUTES.lifeAdmin, tone: 'sand', module: 'vida_real', hint: plural(admin.length, 'coisa aberta', 'coisas abertas') })
  const inbox = db.brainDump.filter((b) => b.status === 'inbox').length
  if (inbox || db.notes.length) out.push({ key: 'inbox', label: 'Inbox & notas', emoji: '🧠', to: ROUTES.inbox, tone: 'ink', module: 'inbox', hint: inbox ? `${plural(inbox, 'pensamento', 'pensamentos')} pra organizar` : plural(db.notes.length, 'nota', 'notas') })
  return out
}

export function spaceGroups(db: DB, today: DateKey): SpaceGroup[] {
  const hidden = new Set(db.profile.modules.filter((m) => !m.visible).map((m) => m.id))
  const visible = (e: SpaceEntry) => !e.module || !hidden.has(e.module)
  const groups: SpaceGroup[] = [
    { key: 'corpo', label: 'Corpo', entries: corpo(db, today) },
    { key: 'trabalho', label: 'Trabalho', all: ROUTES.work, entries: trabalho(db, today) },
    { key: 'aprender', label: 'Aprender', entries: aprender(db) },
    { key: 'vida', label: 'Vida', all: ROUTES.life, entries: vida(db, today) },
  ]
  return groups.map((g) => ({ ...g, entries: g.entries.filter(visible) })).filter((g) => g.entries.length > 0)
}

/** Rituals that are not modules: kept reachable, one quiet line at the bottom. */
export function rituals(db: DB): { key: string; label: string; to: string }[] {
  const out: { key: string; label: string; to: string }[] = [
    { key: 'semana', label: 'Montar a semana', to: ROUTES.weekPlanner },
    { key: 'tarefas', label: 'Tarefas', to: ROUTES.tasks },
    { key: 'revisao', label: 'Revisão da semana', to: ROUTES.weeklyReview },
    { key: 'mes', label: 'Meu mês', to: ROUTES.monthlyReview },
    // Cuidar de Mim: one discreet line here, never on Início (no hint, no count).
    { key: 'cuidar', label: 'Cuidar de Mim', to: ROUTES.care },
  ]
  if (db.goals.length) out.splice(2, 0, { key: 'metas', label: 'Metas', to: ROUTES.goals })
  return out
}

// ─── MARINA OS 2.0: Minha Vida (nine life areas) and Projetos ───────────────

export type LifeAreaKey = 'corpo' | 'autocuidado' | 'mente' | 'estudos' | 'biblioteca' | 'viagens' | 'casa' | 'objetivos'

export interface LifeArea {
  key: LifeAreaKey
  label: string
  entries: SpaceEntry[]
}

const pick = (list: SpaceEntry[], keys: string[]) => keys.flatMap((k) => list.filter((e) => e.key === k))

/**
 * Her life areas, built from the same entries as before (nothing removed, only regrouped). Empty areas don't
 * appear; "Relacionamentos e família" has no data model yet and is left out instead of shown empty.
 * Cuidar de Mim is always reachable, without a hint or a count.
 */
export function lifeAreas(db: DB, today: DateKey): LifeArea[] {
  const hidden = new Set(db.profile.modules.filter((m) => !m.visible).map((m) => m.id))
  const visible = (e: SpaceEntry) => !e.module || !hidden.has(e.module)
  const learn = aprender(db)
  const life = vida(db, today)
  const care: SpaceEntry = { key: 'cuidar', label: 'Cuidar de Mim', emoji: '', to: ROUTES.care, tone: 'sage' }
  const task = (key: string, label: string, to: string): SpaceEntry => ({ key, label, emoji: '', to, tone: 'ink' })
  const areas: LifeArea[] = [
    { key: 'corpo', label: 'Corpo e movimento', entries: corpo(db, today) },
    { key: 'autocuidado', label: 'Saúde e autocuidado', entries: pick(life, ['universo']) },
    { key: 'mente', label: 'Mente e autoconhecimento', entries: [care, ...pick(life, ['biblia']), ...pick(learn, ['atelie'])] },
    { key: 'estudos', label: 'Estudos e desenvolvimento', entries: pick(learn, ['estudos', 'salvos']) },
    { key: 'biblioteca', label: 'Livros e biblioteca', entries: pick(learn, ['livros']) },
    { key: 'viagens', label: 'Viagens e experiências', entries: pick(life, ['viagens']) },
    {
      key: 'casa',
      label: 'Casa, rotina e Luna',
      entries: [...pick(life, ['luna', 'casa', 'inbox']), task('tarefas', 'Tarefas', ROUTES.tasks), task('semana', 'Montar a semana', ROUTES.weekPlanner)],
    },
    {
      key: 'objetivos',
      label: 'Objetivos de vida',
      entries: [...(db.goals.length ? [task('metas', 'Metas', ROUTES.goals)] : []), task('revisao', 'Revisão da semana', ROUTES.weeklyReview), task('mes', 'Meu mês', ROUTES.monthlyReview)],
    },
  ]
  return areas.map((a) => ({ ...a, entries: a.entries.filter(visible) })).filter((a) => a.entries.length > 0)
}

/** Projetos: her professional projects, career, UGC and what she is waiting for (same entries as before). */
export function projectEntries(db: DB, today: DateKey): SpaceEntry[] {
  const hidden = new Set(db.profile.modules.filter((m) => !m.visible).map((m) => m.id))
  return trabalho(db, today).filter((e) => !e.module || !hidden.has(e.module))
}
