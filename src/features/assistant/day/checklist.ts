/**
 * Food checklist of a day (Marina's prompt, section 13): every planned meal with its time, plus prep
 * items — the meal prep engine's kit items (timeline kind 'prep') and the ones she asks Lumos for
 * (dated Tasks with a time and `origin: { type: 'meal', id: <plan meal ref> }`, so they move with the
 * meal and are undoable like everything Lumos does).
 *
 * "Amanhã vou presencial": the meal prep engine's KIT (src/data/mealprep via ../mealprep-adapter).
 */
import { workBlocks } from '@/data/planning'
import { dayTimeline, isAnytime, startMin } from '@/data/timeline'
import type { DateKey, DB, TimeHM } from '@/data/types'
import { hmToMinutes, minutesToHM } from '@/lib/date'
import { capitalize } from '../agents/common'
import type { ChangePlan, ChecklistLine, TaskDraft } from '../adjust/types'
import { MEAL_PREP_PATH, presencialKitFor } from '../mealprep-adapter'
import { prepTask } from './plan'
import { ofDay, onDay } from './text'

/** Meals + food prep items of a day, in time order. */
export function foodChecklist(db: DB, date: DateKey): ChecklistLine[] {
  const timeline = dayTimeline(db, date)
  const lines: ChecklistLine[] = []
  for (const e of timeline) {
    if (e.kind === 'meal' && !isAnytime(e)) {
      lines.push({ key: e.key, time: e.start, title: e.title, emoji: e.emoji, kind: 'meal', done: e.status === 'done', cancelled: e.status === 'cancelled' || e.status === 'skipped', badge: e.badge ?? 'nutri' })
    }
    if (e.kind === 'prep') lines.push({ key: e.key, time: e.start, title: e.title, emoji: '🎒', kind: 'prep', done: e.status === 'done', cancelled: e.status === 'cancelled' })
    if (e.kind === 'task' && e.ref.type === 'task') {
      const t = db.tasks.find((x) => x.id === e.ref.id)
      if (t?.origin?.type === 'meal') lines.push({ key: e.key, time: e.start, title: e.title, emoji: '🎒', kind: 'prep', done: e.status === 'done', cancelled: e.status === 'cancelled' })
    }
  }
  return lines
}

/** When she is out of home that day (BASE work + commute). Presencial days use the real blocks. */
export function awayWindow(db: DB, date: DateKey): { start: TimeHM; end: TimeHM } | undefined {
  const blocks = workBlocks(db.profile, date)
  if (blocks.length && blocks.some((b) => b.mode === 'presencial')) return { start: blocks[0].start, end: blocks[blocks.length - 1].end }
  const w = db.profile.work
  if (!w) return undefined
  return { start: minutesToHM(Math.max(0, hmToMinutes(w.start) - (w.commuteBeforeMin ?? 0))), end: minutesToHM(Math.min(23 * 60 + 59, hmToMinutes(w.end) + (w.commuteAfterMin ?? 0))) }
}

/** Plan meals that happen while she's out → one "levar" item each, before leaving. */
export function portablePrep(db: DB, date: DateKey): { meals: ChecklistLine[]; tasks: TaskDraft[]; window?: { start: TimeHM; end: TimeHM } } {
  const window = awayWindow(db, date)
  if (!window) return { meals: [], tasks: [] }
  const a = hmToMinutes(window.start)
  const b = hmToMinutes(window.end)
  const timeline = dayTimeline(db, date)
  const out = timeline.filter((e) => e.kind === 'meal' && e.ref.type === 'planMeal' && !e.ref.id.startsWith('meal:') && e.status === 'pending' && !isAnytime(e) && startMin(e)! >= a && startMin(e)! < b)
  const leave = minutesToHM(Math.max(0, a - 15))
  const existing = new Set(db.tasks.filter((t) => t.date === date && t.origin?.type === 'meal').map((t) => t.origin!.id))
  let work = db
  const tasks: TaskDraft[] = []
  for (const m of out) {
    if (existing.has(m.ref.id)) continue
    const t = prepTask(work, `Levar ${m.title.toLowerCase()} (${m.start})`, date, leave, m.ref.id)
    tasks.push(t)
    work = { ...work, tasks: [...work.tasks, { ...t, createdAt: '', updatedAt: '' }] }
  }
  const meals = out.map((e) => ({ key: e.key, time: e.start, title: e.title, emoji: e.emoji, kind: 'meal' as const, done: false, badge: e.badge ?? 'nutri' }))
  return { meals, tasks, window }
}

/** "monta meu checklist de amanhã": meals with times + prep items (meal prep kit, Lumos tasks). */
export function planChecklist(db: DB, date: DateKey, today: DateKey): ChangePlan {
  const lines = foodChecklist(db, date)
  const when = onDay(date, today)
  if (!lines.length) {
    return { summary: `${capitalize(when)} não tem refeições do plano com horário — nada pra checar por aqui 🙂`, changes: [], consequences: [], warnings: [] }
  }
  const prep = lines.filter((l) => l.kind === 'prep').length
  return {
    summary: `Checklist ${ofDay(date, today)}`,
    changes: [],
    consequences: prep ? [] : ['Quer um item de preparo? Fala “me lembra de levar o shaker amanhã às 7h”.'],
    warnings: [],
    checklist: lines,
    dayDate: date,
    previewTitle: `${capitalize(when)}: ${lines.length - prep} refeições${prep ? ` e ${prep} ${prep === 1 ? 'item' : 'itens'} de preparo` : ''} — tudo já está na sua linha do dia.`,
  }
}

/**
 * "Amanhã vou presencial o dia inteiro." The meal prep engine's KIT when the day is presencial (its
 * checklist already lives in the Linha do dia). On a day her profile doesn't mark as presencial, the
 * honest version from the plan: what falls while she's out + "levar" items to add, with times.
 */
export function planPresencial(db: DB, date: DateKey, today: DateKey): ChangePlan {
  const when = onDay(date, today)
  const kit = presencialKitFor(db, date)
  if (kit) {
    return {
      summary: kit.title,
      changes: [],
      consequences: kit.legend.length ? [kit.legend.join(' · ')] : [],
      warnings: [],
      checklist: [
        ...kit.checklist.filter((c) => c.date !== date).map((c) => ({ key: c.key, time: c.time, title: `Na véspera · ${c.title}`, emoji: '🎒', kind: 'prep' as const, done: false })),
        ...kit.lines.map((l, i) => ({ key: `kit:${i}`, time: l.time, title: `${l.title}${l.tags.length ? ` ${l.tags.join('')}` : ''}`, kind: 'meal' as const, done: false })),
        ...kit.checklist.filter((c) => c.date === date).map((c) => ({ key: c.key, time: c.time, title: c.title, emoji: '🎒', kind: 'prep' as const, done: false })),
      ].sort((a, b) => (a.title.startsWith('Na véspera') ? -1 : 0) - (b.title.startsWith('Na véspera') ? -1 : 0) || (a.time ?? '').localeCompare(b.time ?? '')),
      dayDate: date,
      previewTitle: kit.intro,
      subtitle: `${kit.title} · o preparo já está na sua linha do dia`,
      link: { label: 'Abrir Meal prep', to: MEAL_PREP_PATH },
    }
  }
  const p = portablePrep(db, date)
  const window = p.window ? ` (fora de casa ~${p.window.start}–${p.window.end})` : ''
  if (!p.meals.length) {
    return {
      summary: `${capitalize(when)} nenhuma refeição do plano cai enquanto você está fora${window} — nada pra levar 🙂`,
      changes: [],
      consequences: [],
      warnings: [],
      link: { label: 'Abrir Meal prep', to: MEAL_PREP_PATH },
    }
  }
  return {
    summary: `Kit ${ofDay(date, today)}`,
    changes: [],
    consequences: ['Seu perfil não marca esse dia como presencial, então o kit completo (geladeira, micro-ondas, bolsa térmica) não saiu automático.'],
    warnings: [],
    checklist: p.meals,
    taskCreates: p.tasks.length ? p.tasks : undefined,
    dayDate: date,
    previewTitle: `${capitalize(when)} você fica fora${window}, então eu não vou te deixar depender de cozinhar nada durante o dia. Do seu plano, vão com você:`,
    doneTitle: 'Coloquei o “levar” no checklist ✓ Pegou e saiu.',
    confirmLabel: p.tasks.length ? 'Adicionar ao checklist' : undefined,
    link: { label: 'Abrir Meal prep', to: MEAL_PREP_PATH },
  }
}
