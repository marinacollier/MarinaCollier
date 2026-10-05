/**
 * ESPAÇOS — "Onde encontro algo específico?" (pure + tested)
 *
 * Four groups (Corpo · Trabalho · Aprender · Vida). Each entry carries a tiny live hint and is
 * HIDDEN when its module has nothing in it ("Livros — 0" never appears). Work lists one entry per
 * real project from the data; names are never hardcoded. Modules Marina hid in Design stay hidden.
 */
import { ROUTES } from '@/app/routes'
import { contextWorkouts } from '@/data/fuel'
import { isTaskOpen, modalityOf, petTasksDue, readingNow, studyingNow, upcomingTrips, waitingFor } from '@/data/selectors'
import type { DateKey, DB, ModuleId, Tone } from '@/data/types'
import { addDays, diffDays } from '@/lib/date'

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
  const refs = db.studyItems.filter((s) => s.reference || s.kind === 'newsletter')
  if (refs.length) out.push({ key: 'salvos', label: 'Conteúdos salvos', emoji: '🔖', to: ROUTES.study, tone: 'sand', module: 'estudos', hint: refs.map((r) => r.source || r.title).slice(0, 2).join(' · ') })
  return out
}

function vida(db: DB, today: DateKey): SpaceEntry[] {
  const out: SpaceEntry[] = []
  const trips = upcomingTrips(db, today)
  if (trips.length) {
    const t = trips[0]
    const d = t.startDate ? diffDays(today, t.startDate) : undefined
    out.push({ key: 'viagens', label: 'Viagens', emoji: '✈️', to: ROUTES.trips, tone: 'ocean', module: 'viagens', hint: d !== undefined && d >= 0 ? `${t.name} em ${plural(d, 'dia', 'dias')}` : t.name })
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
  ]
  if (db.goals.length) out.splice(2, 0, { key: 'metas', label: 'Metas', to: ROUTES.goals })
  return out
}
