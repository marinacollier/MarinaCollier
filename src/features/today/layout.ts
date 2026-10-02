/**
 * Ordering of the Hoje widgets. Pure + tested.
 *
 * Marina's own order (profile.homeWidgets, seeded per §42) is the base. Context only:
 * - keeps 'agora' first;
 * - shows evening-only widgets at night ('amanha', 'fechamento') and lifts them after the Top 3;
 * - lifts the trip card when a trip is close;
 * - energy baixa: only Agora, agenda, treino (if planned), ONE priority, brain dump (+ closing at night);
 * - Friday evening: work/task lists step aside ("Fechando a semana ✨" is rendered by the page);
 * - weekend: activity, travel, life first; work stays visible but at the end.
 * 'resumo_dia' is rendered in the page header, so it's never part of this list.
 */
import type { HomeWidgetId, UserProfile } from '@/data/types'
import type { HomeContext } from './context'

/** Widgets that only make sense in some parts of the day. */
const ONLY_AT_NIGHT: HomeWidgetId[] = ['fechamento', 'amanha']

const LOW_ENERGY: HomeWidgetId[] = ['agora', 'proximo_compromisso', 'treino', 'top3', 'brain_dump', 'fechamento']
const FRIDAY_HIDE: HomeWidgetId[] = ['tarefas', 'work_focus', 'waiting_for']
const WEEKEND_FIRST: HomeWidgetId[] = ['treino', 'proxima_viagem', 'proximo_compromisso', 'top3', 'manha', 'luna']
const WEEKEND_LAST: HomeWidgetId[] = ['work_focus', 'waiting_for', 'tarefas']

export type LayoutContext = Pick<HomeContext, 'part' | 'mode' | 'hasWorkoutToday'> & { tripSoon?: unknown }

function moveAfter(list: HomeWidgetId[], ids: HomeWidgetId[], anchor: HomeWidgetId): HomeWidgetId[] {
  const moving = ids.filter((id) => list.includes(id))
  if (!moving.length) return list
  const rest = list.filter((id) => !moving.includes(id))
  const at = rest.indexOf(anchor)
  const pos = at === -1 ? (rest[0] === 'agora' ? 1 : 0) : at + 1
  return [...rest.slice(0, pos), ...moving, ...rest.slice(pos)]
}

export function orderWidgets(widgets: UserProfile['homeWidgets'], ctx: LayoutContext): HomeWidgetId[] {
  let list: HomeWidgetId[] = widgets
    .filter((w) => w.visible)
    .map((w) => w.id)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .filter((id) => id !== 'resumo_dia')
    .filter((id) => ctx.part === 'noite' || !ONLY_AT_NIGHT.includes(id))

  if (list.includes('agora')) list = ['agora', ...list.filter((id) => id !== 'agora')]

  if (ctx.mode === 'baixa') {
    return list.filter((id) => LOW_ENERGY.includes(id) && (id !== 'treino' || ctx.hasWorkoutToday))
  }
  if (ctx.mode === 'sexta') list = list.filter((id) => !FRIDAY_HIDE.includes(id))
  if (ctx.mode === 'fds') {
    const first = WEEKEND_FIRST.filter((id) => list.includes(id))
    const last = WEEKEND_LAST.filter((id) => list.includes(id))
    const head = list[0] === 'agora' ? ['agora' as const] : []
    list = [...head, ...first, ...list.filter((id) => id !== 'agora' && !first.includes(id) && !last.includes(id)), ...last]
  }
  if (ctx.tripSoon) list = moveAfter(list, ['proxima_viagem'], 'top3')
  if (ctx.part === 'noite') list = moveAfter(list, ['amanha', 'fechamento'], 'top3')
  return list
}
