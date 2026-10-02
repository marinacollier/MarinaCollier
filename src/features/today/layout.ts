/**
 * Contextual ordering of the Hoje widgets.
 * Marina's own order (profile.homeWidgets) is the base; the time of day lifts a few widgets
 * to the top so the home answers "what matters now" without her having to scroll.
 * Pure + tested.
 */
import type { HomeWidgetId, UserProfile } from '@/data/types'
import type { DayPart } from '@/lib/date'

/** Widgets lifted to the top for each part of the day, in this order. */
export const CONTEXT_BOOST: Record<DayPart, HomeWidgetId[]> = {
  // rotina, agenda, Top 3, treino, primeira refeição, alertas
  manha: ['manha', 'proximo_compromisso', 'top3', 'treino', 'refeicoes', 'luna', 'waiting_for'],
  // próximo compromisso, tarefas, alimentação, foco do trabalho, treino pendente
  dia: ['proximo_compromisso', 'top3', 'tarefas', 'refeicoes', 'work_focus', 'treino'],
  // o que falta, refeições, gastos, preparação de amanhã + encerramento
  noite: ['top3', 'tarefas', 'refeicoes', 'gastos', 'fechamento'],
}

/** Widgets that only make sense in some parts of the day. */
const ONLY_IN: Partial<Record<HomeWidgetId, DayPart[]>> = {
  fechamento: ['noite'],
}

/**
 * Ordered list of widget ids to render.
 * - hidden widgets (visible=false) never show
 * - 'agora' (when visible) is always first
 * - boosted widgets for the day part follow, in boost order
 * - everything else keeps Marina's order
 */
export function orderWidgets(widgets: UserProfile['homeWidgets'], part: DayPart): HomeWidgetId[] {
  const visible = widgets
    .filter((w) => w.visible)
    .map((w) => w.id)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .filter((id) => !ONLY_IN[id] || ONLY_IN[id]!.includes(part))
  const set = new Set(visible)
  const out: HomeWidgetId[] = []
  if (set.has('agora')) out.push('agora')
  for (const id of CONTEXT_BOOST[part]) if (set.has(id) && !out.includes(id)) out.push(id)
  for (const id of visible) if (!out.includes(id)) out.push(id)
  return out
}
