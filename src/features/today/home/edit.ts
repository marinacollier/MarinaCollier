/**
 * Quick edits for ANY Home row — Dia · Hora · Obs — through the records' own fields and the existing
 * schedule rules (data/schedule.ts): a one-off record changes itself; a recurring thing changes "só hoje"
 * (ScheduleOverride) or "sempre" (its default). Where a change isn't possible, `*Note` says why in plain words.
 * Every writer returns an Undo (the sheet shows "Desfazer").
 */
import type { ActionItem } from '@/data/agenda/items'
import { applyOps, canSetDefault, clearOverride, planSetDefault, setTimeOn, shiftRoutine, upsertOverride, type ScheduleOp, type Undo } from '@/data/schedule'
import { actions, getDB } from '@/data/store'
import type { CollectionKey, DateKey, DB, ScheduleRefType, TimeHM } from '@/data/types'
import { promoteBacklog } from '@/data/briefing/backlog'
import { addDays, hmToMinutes, minutesToHM } from '@/lib/date'

export type Scope = 'today' | 'always'

export interface EditSpec {
  day?: { value?: DateKey; set: (d: DateKey) => Undo }
  dayNote?: string
  time?: { start?: TimeHM; end?: TimeHM; withEnd: boolean; scopes: Scope[]; set: (scope: Scope, start: TimeHM, end?: TimeHM) => Undo }
  timeNote?: string
  notes?: { value: string; hint?: string; set: (v: string) => Undo }
  notesNote?: string
}

/** Patch any record and return the exact undo. */
export function patch(col: CollectionKey, id: string, p: Record<string, unknown>): Undo {
  const list = getDB()[col] as unknown as Record<string, unknown>[]
  const before = list.find((r) => r.id === id)
  if (!before) return () => {}
  const restore = Object.fromEntries(Object.keys(p).map((k) => [k, before[k]]))
  actions.update(col as never, id, p as never)
  return () => actions.update(col as never, id, restore as never)
}

const both =
  (...undos: Undo[]): Undo =>
  () => {
    for (const u of [...undos].reverse()) u()
  }

const clean = (v: string) => v.trim() || undefined
const notesOf = (col: CollectionKey, id: string, value: string | undefined, hint?: string): EditSpec['notes'] => ({ value: value ?? '', hint, set: (v) => patch(col, id, { notes: clean(v) }) })
const minutesBetween = (a: TimeHM, b?: TimeHM) => (b ? hmToMinutes(b) - hmToMinutes(a) : undefined)

/** A timeline thing that only moves per day ("só hoje"), with "sempre" when its default can change. */
function overrideTime(db: DB, item: ActionItem, type: ScheduleRefType): EditSpec['time'] {
  const ref = { type, id: item.refId }
  const always = canSetDefault(db, ref)
  return {
    start: item.start,
    end: item.end,
    withEnd: false,
    scopes: always ? ['today', 'always'] : ['today'],
    set: (scope, start) => (scope === 'always' ? applyOps(planSetDefault(getDB(), item.date, ref, start)) : setTimeOn(item.date, ref, start)),
  }
}

export function editSpec(db: DB, item: ActionItem): EditSpec {
  const id = item.refId
  switch (item.refType) {
    case 'task': {
      const t = db.tasks.find((x) => x.id === id)
      if (!t) return {}
      const notes = notesOf('tasks', t.id, t.notes)
      if (item.source === 'waiting')
        return { day: { value: t.waiting?.followUpOn, set: (d) => patch('tasks', t.id, { waiting: { ...t.waiting!, followUpOn: d } }) }, timeNote: 'Cobrança não tem hora — só o dia.', notes }
      if (t.recurrence)
        return {
          dayNote: 'Repete — o dia segue a repetição (muda em “Abrir completo”).',
          time: {
            start: item.start ?? t.time,
            withEnd: false,
            scopes: ['today', 'always'],
            set: (scope, start) => (scope === 'today' ? setTimeOn(item.date, { type: 'task', id: t.id }, start) : both(patch('tasks', t.id, { time: start }), clearOverride(item.date, { type: 'task', id: t.id }))),
          },
          notes: { ...notes!, hint: 'vale pra todas as vezes' },
        }
      return {
        day: { value: t.date ?? t.dueDate, set: (d) => patch('tasks', t.id, { date: d, ...(t.bucket === 'hoje' ? { bucket: undefined } : {}) }) },
        time: {
          start: t.time,
          end: t.time && t.durationMin ? minutesToHM(hmToMinutes(t.time) + t.durationMin) : undefined,
          withEnd: true,
          scopes: ['always'],
          set: (_s, start, end) => patch('tasks', t.id, { time: start, date: t.date ?? item.date, durationMin: minutesBetween(start, end) ?? t.durationMin }),
        },
        notes,
      }
    }
    case 'event': {
      const e = db.events.find((x) => x.id === id)
      if (!e) return {}
      const ref = { type: 'event' as const, id: e.id }
      const notes = notesOf('events', e.id, e.notes, e.recurrence ? 'vale pra todas as vezes' : undefined)
      if (e.recurrence)
        return {
          dayNote: 'Repete — pra trocar o dia de vez, “Abrir completo”.',
          time: {
            start: item.start,
            end: item.end,
            withEnd: true,
            scopes: canSetDefault(db, ref) ? ['today', 'always'] : ['today'],
            set: (scope, start, end) =>
              scope === 'today'
                ? upsertOverride(item.date, ref, { time: start, endTime: end, anytime: undefined, cancelled: undefined })
                : both(patch('events', e.id, { startTime: start, endTime: end ?? e.endTime, allDay: false, period: undefined }), clearOverride(item.date, ref)),
          },
          notes,
        }
      return {
        day: {
          value: e.date,
          set: (d) => {
            const span = e.endDate ? Math.round((Date.parse(e.endDate) - Date.parse(e.date)) / 864e5) : undefined
            return patch('events', e.id, { date: d, ...(span !== undefined ? { endDate: addDays(d, span) } : {}) })
          },
        },
        time: { start: e.startTime, end: e.endTime, withEnd: true, scopes: ['always'], set: (_s, start, end) => both(patch('events', e.id, { startTime: start, endTime: end, allDay: false, period: undefined }), clearOverride(item.date, ref)) },
        notes,
      }
    }
    case 'workout': {
      const w = db.workouts.find((x) => x.id === id)
      if (!w) return {}
      return {
        day: { value: w.date, set: (d) => patch('workouts', w.id, { date: d }) },
        time: { start: w.time, withEnd: false, scopes: ['always'], set: (_s, start) => patch('workouts', w.id, { time: start, period: undefined }) },
        notes: notesOf('workouts', w.id, w.notes),
      }
    }
    case 'weekTemplate': {
      const t = db.weekTemplate.find((x) => x.id === id)
      return {
        dayNote: 'Treino da semana base — pra trocar o dia, “Abrir completo”.',
        time: overrideTime(db, item, 'weekTemplate'),
        notes: t ? notesOf('weekTemplate', t.id, t.notes, 'vale toda semana') : undefined,
      }
    }
    case 'routine': {
      const r = db.routines.find((x) => x.id === id)
      if (!r) return {}
      return {
        dayNote: 'Rotina — aparece nos dias dela (itens e dias em “Abrir completo”).',
        time: {
          start: item.start,
          withEnd: false,
          scopes: ['today', 'always'],
          set: (scope, start) => {
            const p = shiftRoutine(getDB(), item.date, r.id, start)
            if (scope === 'today') return p.apply()
            // "sempre": every moved step gets the new default (and that day's override goes away).
            const ops: ScheduleOp[] = p.ops.flatMap((op) => (op.op === 'override' && op.patch.time ? planSetDefault(getDB(), item.date, op.ref, op.patch.time) : []))
            return both(r.startTime ? patch('routines', r.id, { startTime: start }) : () => {}, applyOps(ops))
          },
        },
        notes: notesOf('routines', r.id, r.notes, 'vale pra rotina toda'),
      }
    }
    case 'routineItem':
    case 'planMeal':
    case 'mealPrep':
      return { dayNote: 'Segue o plano do dia.', time: overrideTime(db, item, item.refType), notesNote: 'Sem obs aqui — “Abrir completo”.' }
    case 'petTask': {
      const p = db.petTasks.find((x) => x.id === id)
      return { dayNote: p?.recurrence ? 'Repete — o dia segue a repetição.' : undefined, day: p && !p.recurrence ? { value: p.dueDate, set: (d) => patch('petTasks', p.id, { dueDate: d }) } : undefined, time: overrideTime(db, item, 'petTask'), notes: p ? notesOf('petTasks', p.id, p.notes) : undefined }
    }
    case 'tripItem': {
      const ti = db.tripItems.find((x) => x.id === id)
      if (!ti) return {}
      return {
        day: { value: ti.date, set: (d) => patch('tripItems', ti.id, { date: d }) },
        time: { start: ti.time, withEnd: false, scopes: ['always'], set: (_s, start) => patch('tripItems', ti.id, { time: start }) },
        notes: notesOf('tripItems', ti.id, ti.notes),
      }
    }
    case 'financialCategory': {
      const c = db.financialCategories.find((x) => x.id === id)
      if (!c?.bill) return {}
      const monthly = c.bill.every === 'mes'
      return {
        day: monthly ? { value: item.date, set: (d) => patch('financialCategories', c.id, { bill: { ...c.bill!, dueDay: Number(d.slice(8, 10)) } }) } : undefined,
        dayNote: monthly ? `Muda o vencimento de todo mês (hoje: dia ${c.bill.dueDay ?? '—'}).` : 'Pagamento semanal — muda em Dinheiro.',
        timeNote: 'Pagamento não tem hora.',
        notesNote: 'Sem obs em pagamentos.',
      }
    }
    case 'opportunity': {
      const o = db.opportunities.find((x) => x.id === id)
      if (!o) return {}
      return { day: { value: o.nextActionDate, set: (d) => patch('opportunities', o.id, { nextActionDate: d }) }, timeNote: 'Sem hora — só o dia.', notes: notesOf('opportunities', o.id, o.notes) }
    }
    case 'contact': {
      const c = db.contacts.find((x) => x.id === id)
      if (!c) return {}
      return { day: { value: c.nextFollowUp, set: (d) => patch('contacts', c.id, { nextFollowUp: d }) }, timeNote: 'Sem hora — só o dia.', notes: notesOf('contacts', c.id, c.notes) }
    }
    case 'ugcOpportunity': {
      const o = db.ugcOpportunities.find((x) => x.id === id)
      if (!o) return {}
      const follow = item.ugc?.kind === 'followup'
      return {
        day: follow ? { value: o.nextFollowUpAt, set: (d) => patch('ugcOpportunities', o.id, { nextFollowUpAt: d }) } : undefined,
        dayNote: follow ? undefined : 'O dia segue a cadência da marca (UGC).',
        timeNote: 'Sem hora — só o dia.',
        notes: notesOf('ugcOpportunities', o.id, o.notes),
      }
    }
    case 'content': {
      const c = db.contentItems.find((x) => x.id === id)
      return { day: c ? { value: c.deadline, set: (d) => patch('contentItems', c.id, { deadline: d }) } : undefined, timeNote: 'Prazo é só o dia.', notesNote: 'Roteiro e detalhes em “Abrir completo”.' }
    }
    case 'partnership': {
      const p = db.partnerships.find((x) => x.id === id)
      if (!p) return {}
      return { day: { value: p.deadline, set: (d) => patch('partnerships', p.id, { deadline: d }) }, timeNote: 'Prazo é só o dia.', notes: notesOf('partnerships', p.id, p.notes) }
    }
    case 'milestone': {
      const m = db.milestones.find((x) => x.id === id)
      return { day: m ? { value: m.date, set: (d) => patch('milestones', m.id, { date: d }) } : undefined, timeNote: 'Marco é só o dia.', notesNote: 'Detalhes no projeto.' }
    }
    case 'project': {
      const p = db.projects.find((x) => x.id === id)
      if (!p?.nextDelivery) return {}
      return { day: { value: p.nextDelivery.date, set: (d) => patch('projects', p.id, { nextDelivery: { ...p.nextDelivery!, date: d } }) }, timeNote: 'Entrega é só o dia.', notes: notesOf('projects', p.id, p.notes) }
    }
    case 'backlogItem': {
      const b = db.backlogItems.find((x) => x.id === id)
      if (!b) return {}
      return { day: { set: (d) => promoteBacklog(b.id, d) }, timeNote: 'Ganha hora depois de ter um dia.', notes: notesOf('backlogItems', b.id, b.notes) }
    }
    case 'spiritualSession':
      return { dayNote: 'Estudo sem dia fixo — aparece quando der.', timeNote: 'Sem hora.', notesNote: 'Anotações dentro do estudo (“Abrir completo”).' }
  }
  return {}
}
