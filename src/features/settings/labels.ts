import type { HomeWidgetId, ModuleId, ThemePref } from '@/data/types'
import { ROUTES } from '@/app/routes'

export const WIDGET_META: Record<HomeWidgetId, { label: string; text: string; emoji: string }> = {
  agora: { label: 'Agora / Próximo', text: 'o que importa agora e o que vem depois', emoji: '✨' },
  top3: { label: 'Top 3', text: 'o que realmente importa hoje', emoji: '🎯' },
  manha: { label: 'Rotina da manhã', text: 'uma rotina só, que abre quando você quiser', emoji: '☀️' },
  proximo_compromisso: { label: 'Agenda', text: 'os compromissos do dia', emoji: '📅' },
  treino: { label: 'Treino de hoje', text: 'o treino planejado e o check-in', emoji: '🏃‍♀️' },
  refeicoes: { label: 'Refeições', text: 'o que você comeu ou planejou', emoji: '🥗' },
  gastos: { label: 'Gastos', text: 'quanto saiu hoje e no mês', emoji: '💸' },
  tarefas: { label: 'Tarefas de hoje', text: 'o que está no seu dia', emoji: '✓' },
  proxima_viagem: { label: 'Próxima viagem', text: 'contagem e o que falta', emoji: '✈️' },
  lendo_agora: { label: 'Leitura', text: 'o livro do momento', emoji: '📖' },
  estudo_atual: { label: 'Estudo atual', text: 'agora estou estudando + próximo estudo', emoji: '📚' },
  waiting_for: { label: 'Esperando retorno', text: 'o que depende de outra pessoa', emoji: '⏳' },
  work_focus: { label: 'Precisa de mim — trabalho', text: 'o que no trabalho depende de você', emoji: '💻' },
  luna: { label: 'Luna', text: 'os cuidados de hoje com ela', emoji: '🐾' },
  countdown: { label: 'Contagem regressiva', text: 'dias até algo especial', emoji: '⏳' },
  fechamento: { label: 'Fechamento do dia', text: 'à noite, um respiro pra encerrar', emoji: '🌙' },
  resumo_dia: { label: 'Hoje em uma linha', text: 'trabalho, treino e o projeto do dia', emoji: '📍' },
  brain_dump: { label: 'Brain dump', text: 'tirar isso da cabeça em um toque', emoji: '🧠' },
  amanha: { label: 'Amanhã', text: 'à noite: o que preparar pro dia seguinte', emoji: '👜' },
}

export interface ModuleEntry {
  key: string
  label: string
  emoji: string
  to: string
  /** When set, visibility follows profile.modules. */
  module?: ModuleId
  tone: 'accent' | 'sage' | 'ocean' | 'sand' | 'plum' | 'ink'
}

export const MORE_MODULES: ModuleEntry[] = [
  { key: 'corpo', label: 'Corpo', emoji: '🏃‍♀️', to: ROUTES.body, module: 'corpo', tone: 'accent' },
  { key: 'dinheiro', label: 'Dinheiro', emoji: '💸', to: ROUTES.money, module: 'dinheiro', tone: 'sage' },
  { key: 'metas', label: 'Metas', emoji: '🎯', to: ROUTES.goals, module: 'metas', tone: 'accent' },
  { key: 'estudos', label: 'Estudos', emoji: '📚', to: ROUTES.study, module: 'estudos', tone: 'ocean' },
  { key: 'livros', label: 'Livros', emoji: '📖', to: ROUTES.books, module: 'livros', tone: 'plum' },
  { key: 'viagens', label: 'Viagens', emoji: '✈️', to: ROUTES.trips, module: 'viagens', tone: 'ocean' },
  { key: 'creator', label: 'Creator / UGC', emoji: '🎬', to: ROUTES.creator, module: 'creator', tone: 'plum' },
  { key: 'vida_real', label: 'Vida real', emoji: '🏡', to: ROUTES.lifeAdmin, module: 'vida_real', tone: 'sand' },
  { key: 'luna', label: 'Luna', emoji: '🐾', to: ROUTES.luna, module: 'luna', tone: 'sand' },
  { key: 'inbox', label: 'Inbox', emoji: '🧠', to: ROUTES.inbox, module: 'inbox', tone: 'ink' },
  { key: 'tarefas', label: 'Tarefas', emoji: '✓', to: ROUTES.tasks, tone: 'sage' },
  { key: 'revisao', label: 'Revisão da semana', emoji: '🗓️', to: ROUTES.weeklyReview, module: 'revisao', tone: 'sage' },
  { key: 'mes', label: 'Meu mês', emoji: '🌙', to: ROUTES.monthlyReview, module: 'mes', tone: 'plum' },
  { key: 'mari', label: 'Mari', emoji: '✨', to: ROUTES.assistant, module: 'mari', tone: 'accent' },
  { key: 'busca', label: 'Busca', emoji: '🔎', to: ROUTES.search, tone: 'ink' },
]

/** Modules Marina can hide (the bottom-nav tabs and Hoje always stay). */
export const HIDEABLE_MODULES = MORE_MODULES.filter((m) => m.module) as (ModuleEntry & { module: ModuleId })[]

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Automático' },
]
