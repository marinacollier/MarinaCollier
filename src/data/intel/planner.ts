/**
 * SmartPlanner — "monta minha semana". Layers, in this order:
 *   fixo (calendar + work) → treino_chave (the weekly template materialized; key sessions first) →
 *   preparo (fuel prep the evening before key sessions, presencial kits, the meal prep session) →
 *   prazo (due dates, milestones, deliveries) → estudo (active tracks, modest: ≤ 2 blocks) → vida
 *   (flexible weekly intentions, Luna, life admin).
 * Rest days and free space are preserved: nothing new lands on a rest day, and a day only gets a new
 * block when it still keeps a free window afterwards. `apply()` writes everything (+ LifeEvents) with ONE undo.
 */
import type { DateKey, DB, Provenance, Task, TimeHM, Workout } from '../types'
import { contextWorkouts } from '../fuel'
import { conflictsBetween, PERIOD_RANGES, proposeWeekFromTemplate, suggestWindows, workBlocks, workMode } from '../planning'
import { eventsFor, modalityOf } from '../selectors'
import { batchPlan, planFor, prepDateOf } from '../mealprep'
import { nightTime } from '../mealprep/menu'
import { nextOrder } from '../store'
import { addDays, hmToMinutes, minutesToHM, startOfWeek, weekday, weekDays, WEEKDAY_LONG } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'
import { busyIntervals, dayBounds, freeWindows } from './context'
import { eventOp } from './log'
import { commitOps, createOp, previewOps, type IntelOp } from './ops'
import type { Now, PlanLayer, WeekProposal, WeekProposalItem } from './types'

const LAYER_ORDER: PlanLayer[] = ['fixo', 'treino_chave', 'preparo', 'prazo', 'estudo', 'vida', 'descanso']
const STUDY_MIN = 45
const MAX_STUDY = 2
const KEEP_FREE = 60

/** Default week: this one; from Saturday on, the next one ("monta minha semana" on the weekend). */
export function defaultPlanWeek(now: Now): DateKey {
  const wd = weekday(now.date)
  return startOfWeek(wd === 6 || wd === 0 ? addDays(now.date, 7) : now.date)
}

type Item = WeekProposalItem & { date: DateKey }

const fmtDM = (d: DateKey) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export function planWeek(db: DB, now: Now, weekStart?: DateKey): WeekProposal {
  const ws = startOfWeek(weekStart ?? defaultPlanWeek(now))
  const days = weekDays(ws)
  const we = days[6]
  const open = (d: DateKey) => d >= now.date
  const ops: IntelOp[] = []
  const items: Item[] = []
  const add = (date: DateKey, title: string, layer: PlanLayer, provenance: Provenance, isNew: boolean, time?: TimeHM) => items.push({ date, title, layer, provenance, isNew, ...(time ? { time } : {}) })

  // ── Trainings: the template materialized (key sessions are their own layer) ──
  for (const p of proposeWeekFromTemplate(db, ws)) {
    if (!open(p.date)) continue
    if (p.workout) {
      ops.push(createOp('workouts', { ...p.workout } as unknown as Record<string, unknown>))
      if (p.choice === 'rest') add(p.date, p.workout.title || 'Descanso', 'descanso', 'fact', true)
    } else if (p.choice === 'one_of' && p.options?.length) {
      const t = db.weekTemplate.find((x) => x.id === p.templateId)
      add(p.date, `${t?.title ?? 'Treino flexível'}: ${p.options.map((m) => modalityOf(db, m).label.toLowerCase()).join(', ')} — você escolhe`, 'vida', 'suggestion', false)
    }
  }
  let preview = previewOps(db, ops)
  const trainingsOf = (d: DateKey): Workout[] => contextWorkouts(preview, d)
  const createdIds = new Set(ops.filter((o) => o.op === 'create').map((o) => (o.op === 'create' ? o.item.id : '')))
  for (const d of days) {
    for (const w of trainingsOf(d)) add(d, w.title || modalityOf(db, w.modality).label, w.isKeySession ? 'treino_chave' : 'fixo', 'fact', createdIds.has(w.id), w.time)
    if (preview.workouts.some((w) => w.date === d && w.status === 'descanso') && !items.some((i) => i.date === d && i.layer === 'descanso')) add(d, 'Descanso', 'descanso', 'fact', false)
  }

  // ── Fixed: calendar + work ──
  for (const d of days) {
    for (const e of eventsFor(preview, d)) {
      const fixed = e.planType === 'fixo' || e.kind === 'trabalho' || e.kind === 'saude'
      add(d, e.title, fixed ? 'fixo' : 'vida', e.external ? 'integration' : 'fact', false, e.startTime ?? (e.period ? PERIOD_RANGES[e.period][0] : undefined))
    }
    const work = workBlocks(preview, d).find((b) => b.kind === 'work')
    if (work) add(d, work.title, 'fixo', 'fact', false, work.start)
  }

  // Rest days: marked rest, or days off with no key session and no training at all.
  const rest = new Set(days.filter((d) => items.some((i) => i.date === d && i.layer === 'descanso')))
  if (!rest.size) {
    const calm = days.filter((d) => workMode(preview, d) === 'off' && !trainingsOf(d).some((w) => w.isKeySession))
    for (const d of calm) {
      rest.add(d)
      if (open(d)) add(d, 'Dia leve — nada novo entra aqui', 'descanso', 'inference', false)
    }
  }

  // ── Preparation: fuel the evening before key sessions, presencial kits, meal prep session ──
  const night = nightTime(preview)
  for (const d of [...days, addDays(we, 1)]) {
    const prev = addDays(d, -1)
    if (!open(prev) || prev < addDays(ws, -1)) continue
    const key = contextWorkouts(preview, d).find((w) => w.requiresPreviousDayPrep)
    if (key) add(prev, `Preparar ${key.title ?? 'o treino'} de amanhã (jantar do plano + separar o intra)`, 'preparo', 'inference', false, night)
    if (days.includes(d) && workMode(preview, d) === 'presencial') add(prev, `Kit presencial de ${WEEKDAY_LONG[weekday(d)]}`, 'preparo', 'inference', false, night)
  }
  const prepDate = prepDateOf(ws)
  let mealPrepTask: Task | undefined
  if (db.nutritionDayPlans.some((p) => p.active) && !planFor(db, ws) && open(prepDate)) {
    const existing = db.tasks.find((t) => t.date === prepDate && normalize(t.title).includes('meal prep') && t.status !== 'archived')
    if (!existing) {
      const minutes = batchPlan(preview, ws).totalMinutes[0]
      const op = createOp('tasks', { title: 'Meal prep da semana', date: prepDate, durationMin: minutes || undefined, status: 'todo', context: 'vida_real', area: 'pessoal', planType: 'flexivel', bucket: 'semana', order: nextOrder(db.tasks) })
      ops.push(op)
      mealPrepTask = op.item as unknown as Task
    }
    add(prepDate, `Meal prep da semana${mealPrepTask?.durationMin ? ` (~${Math.round(mealPrepTask.durationMin / 15) * 15} min)` : ''}`, 'preparo', 'inference', !existing)
  }
  preview = previewOps(db, ops)

  // ── Deadlines ──
  const openTask = (t: Task) => t.status !== 'done' && t.status !== 'archived' && t.status !== 'waiting'
  for (const t of db.tasks.filter((t) => openTask(t) && t.dueDate && t.dueDate >= ws && t.dueDate <= we && !t.recurrence)) {
    add(t.dueDate!, `Prazo: ${t.title}`, 'prazo', 'fact', false)
    if (t.date) continue
    // No day to do it yet: the latest open, non-rest day up to the deadline with the most free time.
    const candidates = days.filter((d) => open(d) && d <= t.dueDate! && !rest.has(d))
    const best = candidates
      .map((d) => ({ d, free: freeWindows(busyIntervals(preview, d), dayBounds(preview).wake, dayBounds(preview).sleep).reduce((s, f) => Math.max(s, hmToMinutes(f.end) - hmToMinutes(f.start)), 0) }))
      .filter((x) => x.free >= (t.durationMin ?? 30) + KEEP_FREE)
      .sort((a, b) => b.d.localeCompare(a.d))[0]
    if (!best) continue
    ops.push({ op: 'patch', collection: 'tasks', id: t.id, patch: { date: best.d } })
    add(best.d, `${t.title} (prazo ${fmtDM(t.dueDate!)})`, 'prazo', 'suggestion', true)
  }
  for (const m of db.milestones.filter((m) => !m.done && m.status !== 'feito' && m.date && m.date >= ws && m.date <= we)) {
    const p = db.projects.find((x) => x.id === m.projectId)
    add(m.date!, `${p ? `${p.name}: ` : ''}${m.title}`, 'prazo', 'fact', false)
  }
  for (const p of db.projects.filter((p) => p.status !== 'concluido' && p.nextDelivery?.date && p.nextDelivery.date >= ws && p.nextDelivery.date <= we)) {
    add(p.nextDelivery!.date!, `${p.name}: ${p.nextDelivery!.title}`, 'prazo', 'fact', false)
  }
  for (const c of db.contentItems.filter((c) => c.deadline && c.deadline >= ws && c.deadline <= we && c.stage !== 'publicado')) add(c.deadline!, `Conteúdo: ${c.title}`, 'prazo', 'fact', false)
  for (const b of db.partnerships.filter((b) => b.deadline && b.deadline >= ws && b.deadline <= we && b.stage !== 'finalizado')) add(b.deadline!, `${b.brand}: entrega`, 'prazo', 'fact', false)
  preview = previewOps(db, ops)

  // ── Study (modest): one block per active track not already in the calendar, max 2 a week ──
  const weekEvents = normalize(days.flatMap((d) => eventsFor(preview, d).map((e) => e.title)).join(' | '))
  const tracks = db.studyTracks.filter((t) => !t.archived && t.status === 'ativo' && !weekEvents.includes(normalize(t.name))).sort((a, b) => a.order - b.order)
  const usedDays = new Set<DateKey>()
  let studies = 0
  for (const track of tracks) {
    if (studies >= MAX_STUDY) break
    const already = db.tasks.some((t) => t.context === 'estudo' && t.date && t.date >= ws && t.date <= we && normalize(t.title).includes(normalize(track.name)))
    if (already) continue
    const current = db.studyItems.find((s) => s.trackId === track.id && s.status === 'estudando' && !s.reference)
    // Weekdays first (weekends stay lighter); never on presencial or rest days.
    const pool = days.filter((d) => open(d) && !rest.has(d) && !usedDays.has(d) && workMode(preview, d) !== 'presencial')
    const slot = studySlot(preview, [...pool.filter((d) => weekday(d) >= 1 && weekday(d) <= 5), ...pool.filter((d) => weekday(d) === 0 || weekday(d) === 6)])
    if (!slot) continue
    const title = current ? (normalize(current.title).startsWith(normalize(track.name)) ? `${track.emoji} ${current.title}` : `${track.emoji} ${track.name} — ${current.title}`) : `${track.emoji} ${track.name}`
    ops.push(createOp('tasks', { title, date: slot.date, time: slot.time, durationMin: STUDY_MIN, status: 'todo', context: 'estudo', area: 'estudo', planType: 'flexivel', bucket: 'semana', order: nextOrder(db.tasks) + studies + 1 }))
    add(slot.date, title, 'estudo', 'suggestion', true, slot.time)
    usedDays.add(slot.date)
    studies++
    preview = previewOps(db, ops)
  }

  // ── Life: flexible weekly intentions, Luna, life admin ──
  for (const g of db.workoutGoals) {
    if (g.status !== 'ativa' || g.planType !== 'flexivel' || !g.perWeek || !g.modality || g.obligation === false) continue
    const placed = preview.workouts.filter((w) => w.modality === g.modality && days.includes(w.date) && w.status !== 'pulado' && w.status !== 'descanso').length
    if (placed >= g.perWeek) continue
    const from = days.find(open) ?? ws
    const win = suggestWindows(preview, { modality: g.modality, from, preferredWeekdays: g.preferredWeekdays, durationMin: 60, limit: 5 }).find((s) => !rest.has(s.date))
    if (!win) continue
    const m = modalityOf(db, g.modality)
    ops.push(createOp('workouts', { date: win.date, time: win.start, modality: g.modality, status: 'planejado', title: m.label, plannedDurationMin: 60, planType: 'flexivel', workoutGoalId: g.id, order: 0 }))
    add(win.date, `${m.emoji} ${m.label} (${win.reason})`, 'vida', 'suggestion', true, win.start)
    preview = previewOps(db, ops)
  }
  for (const p of db.petTasks.filter((p) => p.active && !p.recurrence && p.dueDate && p.dueDate >= ws && p.dueDate <= we)) add(p.dueDate!, `🐾 ${p.title}`, 'vida', 'fact', false)
  for (const t of db.tasks.filter((t) => openTask(t) && t.context === 'vida_real' && t.date && t.date >= ws && t.date <= we && t.id !== mealPrepTask?.id)) add(t.date!, t.title, 'vida', 'fact', false, t.time)

  // ── Result ──
  const final = previewOps(db, ops)
  const { wake, sleep } = dayBounds(final)
  const allDays = open(prepDate) && items.some((i) => i.date === prepDate) ? [prepDate, ...days] : days
  const out: WeekProposal['days'] = allDays.map((date) => ({
    date,
    items: items
      .filter((i) => i.date === date)
      .sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer) || (a.time ?? '99').localeCompare(b.time ?? '99'))
      .map(({ date: _d, ...i }) => i),
    free: freeWindows(busyIntervals(final, date), date === now.date ? Math.max(wake, now.minutes) : wake, sleep, KEEP_FREE),
  }))
  const conflicts = conflictsBetween(final, ws, we)
    .filter((c) => c.severity === 'warn')
    .map((c) => ({ date: c.date, text: c.message }))

  const keyTitles = [...new Set(items.filter((i) => i.layer === 'treino_chave').map((i) => i.title))]
  const count = (l: PlanLayer, onlyNew = false) => items.filter((i) => i.layer === l && (!onlyNew || i.isNew)).length
  const parts = [
    keyTitles.length ? `${keyTitles.length} ${keyTitles.length === 1 ? 'treino-chave' : 'treinos-chave'} (${keyTitles.join(', ')})` : undefined,
    count('preparo') ? `${count('preparo')} ${count('preparo') === 1 ? 'preparo' : 'preparos'}` : undefined,
    count('prazo') ? `${count('prazo')} ${count('prazo') === 1 ? 'prazo' : 'prazos'}` : undefined,
    count('estudo') ? `${count('estudo')} ${count('estudo') === 1 ? 'bloco de estudo' : 'blocos de estudo'}` : undefined,
  ].filter(Boolean) as string[]
  const restLine = [...rest].filter(open).map((d) => WEEKDAY_LONG[weekday(d)])
  const summary = [
    `Semana de ${fmtDM(ws)}: ${parts.length ? joinPt(parts) : 'só o que já é fixo'}.`,
    restLine.length ? `${cap(joinPt(restLine))} ${restLine.length === 1 ? 'fica leve' : 'ficam leves'}.` : undefined,
    conflicts.length ? `${conflicts.length === 1 ? 'Um conflito' : `${conflicts.length} conflitos`} pra você olhar.` : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  const apply = () => {
    const at = now.iso ?? nowISO()
    const existing = db.weekPlans.find((p) => p.weekStart === ws)
    const unit: IntelOp[] = [
      ...ops,
      existing ? { op: 'patch', collection: 'weekPlans', id: existing.id, patch: { confirmedAt: at } } : createOp('weekPlans', { weekStart: ws, confirmedAt: at }),
      eventOp({ at, date: ws, kind: 'created', title: `Semana de ${fmtDM(ws)} montada${count('estudo', true) + count('vida', true) + count('prazo', true) ? ` (${count('estudo', true) + count('vida', true) + count('prazo', true)} coisas novas no lugar)` : ''}`, area: 'rotina', by: 'lumos', provenance: 'suggestion' }),
    ]
    return commitOps(unit)
  }
  return { weekStart: ws, days: out, conflicts, summary, apply }
}

/** A study slot: a free window after work (or in the afternoon on days off), keeping free space left. */
function studySlot(db: DB, candidates: DateKey[]): { date: DateKey; time: TimeHM } | undefined {
  const { sleep } = dayBounds(db)
  for (const d of candidates) {
    const work = workBlocks(db, d)
    const from = work.length ? hmToMinutes(work[work.length - 1].end) + 30 : 14 * 60
    const windows = freeWindows(busyIntervals(db, d), from, sleep - 30, STUDY_MIN)
    const total = freeWindows(busyIntervals(db, d), dayBounds(db).wake, sleep, 30).reduce((s, f) => s + hmToMinutes(f.end) - hmToMinutes(f.start), 0)
    const w = windows[0]
    if (!w || total - STUDY_MIN < KEEP_FREE) continue
    return { date: d, time: minutesToHM(Math.ceil(hmToMinutes(w.start) / 15) * 15) }
  }
  return undefined
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}
