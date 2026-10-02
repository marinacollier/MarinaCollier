/**
 * Command palette commands (pure): static "create" actions, dynamic "Abrir <projeto>" /
 * "Ver viagem <viagem>", and "Ir para <área>". Filtered with a small fuzzy matcher.
 */
import type { DateKey, DB } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { activeProjects, upcomingTrips } from '@/data/selectors'
import { normalize } from '@/lib/text'
import { routeAction, sheetAction, type ResultAction } from '@/features/search/actions'

export type CommandSection = 'criar' | 'abrir' | 'ir' | 'mari'

export interface Command {
  id: string
  label: string
  emoji: string
  section: CommandSection
  /** Extra words that should find this command ("gasto" → "despesa", "compra"…). */
  keywords: string[]
  action: ResultAction
}

export const SECTION_LABEL: Record<CommandSection, string> = {
  criar: 'Criar',
  abrir: 'Abrir',
  ir: 'Ir para',
  mari: 'Mari',
}

const MAIN_ROUTES: { label: string; emoji: string; to: string; keywords?: string[] }[] = [
  { label: 'Hoje', emoji: '☀️', to: ROUTES.today, keywords: ['home', 'inicio', 'dia'] },
  { label: 'Agenda', emoji: '📅', to: ROUTES.agenda, keywords: ['calendario', 'compromissos'] },
  { label: 'Vida', emoji: '🌿', to: ROUTES.life },
  { label: 'Trabalho', emoji: '💼', to: ROUTES.work, keywords: ['work', 'projetos'] },
  { label: 'Tarefas', emoji: '✓', to: ROUTES.tasks, keywords: ['todo', 'pendencias'] },
  { label: 'Brain dump', emoji: '🧠', to: ROUTES.inbox, keywords: ['inbox', 'ideias', 'notas', 'cabeca'] },
  { label: 'Corpo', emoji: '🏃‍♀️', to: ROUTES.body, keywords: ['treinos', 'alimentacao', 'refeicoes', 'esporte'] },
  { label: 'Dinheiro', emoji: '💸', to: ROUTES.money, keywords: ['gastos', 'financas', 'orcamento'] },
  { label: 'Metas', emoji: '🎯', to: ROUTES.goals, keywords: ['objetivos'] },
  { label: 'Estudos', emoji: '📚', to: ROUTES.study, keywords: ['cursos', 'aprender'] },
  { label: 'Livros', emoji: '📖', to: ROUTES.books, keywords: ['leitura'] },
  { label: 'Viagens', emoji: '✈️', to: ROUTES.trips, keywords: ['trips'] },
  { label: 'Luna', emoji: '🐾', to: ROUTES.luna, keywords: ['pet', 'cachorro'] },
  { label: 'Vida real', emoji: '🏡', to: ROUTES.lifeAdmin, keywords: ['casa', 'documentos', 'burocracia'] },
  { label: 'Creator / UGC', emoji: '🎬', to: ROUTES.creator, keywords: ['conteudo', 'ugc', 'parcerias'] },
  { label: 'Work inbox', emoji: '📥', to: ROUTES.workInbox, keywords: ['emails', 'teams', 'outlook'] },
  { label: 'Wins', emoji: '✨', to: ROUTES.wins, keywords: ['conquistas'] },
  { label: 'Montar minha semana', emoji: '🧭', to: ROUTES.weekPlanner, keywords: ['semana', 'planejar', 'planner', 'treinos da semana', 'conflitos'] },
  { label: 'Revisão semanal', emoji: '🗓️', to: ROUTES.weeklyReview, keywords: ['review'] },
  { label: 'Meu mês', emoji: '🌙', to: ROUTES.monthlyReview, keywords: ['review', 'mes'] },
  { label: 'Mari', emoji: '✨', to: ROUTES.assistant, keywords: ['assistente', 'chief of staff', 'perguntar'] },
  { label: 'Busca', emoji: '🔎', to: ROUTES.search, keywords: ['procurar', 'buscar'] },
  { label: 'Mais', emoji: '⋯', to: ROUTES.more },
  { label: 'Ajustes', emoji: '⚙️', to: ROUTES.settings, keywords: ['configuracoes', 'settings'] },
]

export function buildCommands(db: DB, today: DateKey): Command[] {
  const create: Command[] = [
    { id: 'new-task', label: 'Criar tarefa', emoji: '✓', section: 'criar', keywords: ['nova tarefa', 'todo', 'fazer', 'adicionar tarefa'], action: sheetAction('task', { defaults: { date: today } }) },
    { id: 'new-expense', label: 'Adicionar gasto', emoji: '💸', section: 'criar', keywords: ['novo gasto', 'despesa', 'compra', 'paguei', 'dinheiro'], action: sheetAction('expense') },
    { id: 'new-workout', label: 'Registrar treino', emoji: '🏃‍♀️', section: 'criar', keywords: ['novo treino', 'corrida', 'bike', 'musculacao', 'exercicio'], action: sheetAction('workout', { date: today }) },
    { id: 'new-meal', label: 'Registrar refeição', emoji: '🥗', section: 'criar', keywords: ['comida', 'almoco', 'jantar', 'cafe', 'lanche'], action: sheetAction('meal', { date: today }) },
    { id: 'new-idea', label: 'Registrar ideia', emoji: '💡', section: 'criar', keywords: ['nova ideia', 'nota', 'insight'], action: sheetAction('note', { kind: 'ideia' }) },
    { id: 'brain-dump', label: 'Tirar da cabeça', emoji: '🧠', section: 'criar', keywords: ['brain dump', 'anotar', 'capturar', 'lembrar'], action: sheetAction('brainDump', {}) },
    { id: 'new-book', label: 'Adicionar livro', emoji: '📖', section: 'criar', keywords: ['novo livro', 'leitura', 'ler'], action: sheetAction('book', {}) },
    { id: 'new-event', label: 'Novo compromisso', emoji: '📅', section: 'criar', keywords: ['evento', 'agenda', 'reuniao', 'marcar'], action: sheetAction('event', { date: today }) },
  ]
  const projects: Command[] = activeProjects(db).map((p) => ({
    id: `project-${p.id}`,
    label: `Abrir ${p.name}`,
    emoji: p.emoji,
    section: 'abrir',
    keywords: [p.name, 'projeto'],
    action: routeAction(ROUTES.project(p.id)),
  }))
  const trips: Command[] = upcomingTrips(db, today).map((t) => ({
    id: `trip-${t.id}`,
    label: `Ver viagem ${t.name}`,
    emoji: t.flag,
    section: 'abrir',
    keywords: [t.name, t.place ?? '', 'viagem'],
    action: routeAction(ROUTES.trip(t.id)),
  }))
  const routes: Command[] = MAIN_ROUTES.map((r) => ({
    id: `route-${r.to}`,
    label: `Ir para ${r.label}`,
    emoji: r.emoji,
    section: 'ir',
    keywords: [r.label, ...(r.keywords ?? [])],
    action: routeAction(r.to),
  }))
  return [...create, ...projects, ...trips, ...routes]
}

/**
 * Fuzzy score of `query` against `text` (both normalized). Higher is better, 0 = no match.
 * Substring matches win (more at word starts / beginning); otherwise every query char must
 * appear in order, with bonuses for consecutive chars and word starts.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = normalize(query).replace(/\s+/g, ' ')
  const t = normalize(text)
  if (!q) return 1
  const idx = t.indexOf(q)
  if (idx >= 0) {
    const wordStart = idx === 0 || /[^a-z0-9]/.test(t[idx - 1])
    return 100 + (idx === 0 ? 40 : 0) + (wordStart ? 25 : 0) - Math.min(idx, 20)
  }
  const tokens = q.split(' ').filter(Boolean)
  if (tokens.length > 1 && tokens.every((tok) => t.includes(tok))) return 80
  const compact = q.replace(/\s/g, '')
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of compact) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return 0
    score += 1
    if (found === prev + 1) score += 3
    if (found === 0 || /[^a-z0-9]/.test(t[found - 1])) score += 4
    prev = found
    ti = found + 1
  }
  // Very scattered matches are noise.
  const spread = prev - t.indexOf(compact[0])
  if (spread > compact.length * 4) return 0
  return Math.min(score, 79)
}

export function scoreCommand(cmd: Command, query: string): number {
  // "Adicionar gasto" should match "gasto" as if it started there.
  const object = cmd.label.replace(/^(ir para|ver viagem|abrir|criar|adicionar|registrar|novo|nova|tirar)\s+/i, '')
  const label = Math.max(fuzzyScore(query, cmd.label), fuzzyScore(query, object))
  const kw = Math.max(0, ...cmd.keywords.map((k) => fuzzyScore(query, k) - 30))
  return Math.max(label, kw)
}

/** Empty query → creates first, then everything. Otherwise best fuzzy matches. */
export function filterCommands(commands: Command[], query: string, limit = 8): Command[] {
  if (!query.trim()) return commands
  return commands
    .map((c, i) => ({ c, s: scoreCommand(c, query), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c)
}

/** "Perguntar à Mari" for whatever was typed. */
export function askMariCommand(query: string): Command {
  return {
    id: 'ask-mari',
    label: `Perguntar à Mari: “${query.trim()}”`,
    emoji: '✨',
    section: 'mari',
    keywords: [],
    action: routeAction(`${ROUTES.assistant}?q=${encodeURIComponent(query.trim())}`),
  }
}
