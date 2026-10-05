/**
 * Lumos Memory by conversation.
 *   "não faço mais yoga na terça"   → CURRENT STATE updated (direct + Desfazer); when it touches a
 *                                      recurring default (week template, recurring event, routine,
 *                                      preferred weekday) Lumos asks before changing the default
 *   "tira yoga de terça do padrão"  → the default itself (confirm first)
 *   "lembra que eu prefiro …"       → preference / fact
 *   "sim, considera como preferência: …" / "não considera: …" → answer to a pattern question (asked once)
 *   "o que você sabe sobre mim?"    → a short view by layer + the screen to edit it
 */
import { ROUTES } from '@/app/routes'
import { memoryView, type MemoryLayer, type Now } from '@/data/intel'
import { findModality } from '@/data/planning'
import { getDB } from '@/data/store'
import type { CalendarEvent, DB, MemoryArea, Recurrence, RoutineItem, Weekday, WeekTemplateItem, Workout, WorkoutGoal } from '@/data/types'
import { normalize } from '@/lib/text'
import { WEEKDAY_LONG } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { listJoin, plural } from '../../agents/common'
import { all, eventDraft, removeUndoable, runLogged, updateUndoable } from '../log'
import { archiveMemory, findMemoryByText, remember } from '../memory'
import { policyFor } from '../policy'
import { cap, norm, WEEKDAY_PLURAL, weekdayIn } from '../text'
import type { Handler, HandlerInput, LumosReply, Undo } from '../types'

const AREA = 'memória'

function slug(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// ─── What a subject + weekday touches in her recurring defaults ─────────────

interface Defaults {
  template: WeekTemplateItem[]
  events: CalendarEvent[]
  routine: RoutineItem[]
  goals: WorkoutGoal[]
  workouts: Workout[]
}

function modalityIds(db: DB, subject: string): string[] {
  const s = norm(subject)
  return db.profile.modalities.filter((m) => norm(m.label) === s || m.id === s || norm(m.label).includes(s) || s.includes(norm(m.label))).map((m) => m.id)
}

const titleHits = (title: string | undefined, subject: string) => !!title && norm(title).includes(norm(subject))
const weeklyHas = (r: Recurrence | undefined, wd: Weekday) => r?.kind === 'weekly' && r.weekdays.includes(wd)

export function defaultsTouching(db: DB, subject: string, wd: Weekday | undefined, today: string): Defaults {
  const mods = modalityIds(db, subject)
  const onDay = (w: Weekday) => wd === undefined || w === wd
  const template = db.weekTemplate.filter((t) => t.active && onDay(t.weekday) && (t.modalities.some((m) => mods.includes(m)) || titleHits(t.title, subject)))
  const events = db.events.filter((e) => e.recurrence?.kind === 'weekly' && (wd === undefined || weeklyHas(e.recurrence, wd)) && titleHits(e.title, subject))
  const routine = db.routineItems.filter((i) => i.active && (wd === undefined ? i.recurrence.kind === 'weekly' : weeklyHas(i.recurrence, wd)) && titleHits(i.title, subject))
  const goals = db.workoutGoals.filter((g) => g.status === 'ativa' && (g.modality ? mods.includes(g.modality) : titleHits(g.title, subject)) && (wd === undefined || g.preferredWeekdays?.includes(wd)))
  const tIds = new Set(template.map((t) => t.id))
  const workouts = db.workouts.filter((w) => w.date >= today && w.status === 'planejado' && !!w.templateId && tIds.has(w.templateId))
  return { template, events, routine, goals, workouts }
}

const countDefaults = (d: Defaults) => d.template.length + d.events.length + d.routine.length + d.goals.length

function describeDefaults(d: Defaults): string[] {
  const out: string[] = []
  if (d.template.length) out.push('seu template de treinos')
  if (d.events.length) out.push(`a agenda (${listJoin(d.events.map((e) => e.title))})`)
  if (d.routine.length) out.push('sua rotina')
  if (d.goals.length) out.push('os dias preferidos da meta')
  return out
}

function applyDefaults(d: Defaults, wd: Weekday | undefined): Undo {
  const undos: Undo[] = []
  for (const t of d.template) undos.push(updateUndoable('weekTemplate', t.id, { active: false }))
  for (const e of d.events) {
    const days = e.recurrence?.kind === 'weekly' ? e.recurrence.weekdays : []
    const keep = wd === undefined ? [] : days.filter((x) => x !== wd)
    undos.push(keep.length ? updateUndoable('events', e.id, { recurrence: { kind: 'weekly', weekdays: keep } }) : removeUndoable('events', e.id))
  }
  for (const i of d.routine) {
    const days = i.recurrence.kind === 'weekly' ? i.recurrence.weekdays : []
    const keep = wd === undefined ? [] : days.filter((x) => x !== wd)
    undos.push(keep.length ? updateUndoable('routineItems', i.id, { recurrence: { kind: 'weekly', weekdays: keep } }) : updateUndoable('routineItems', i.id, { active: false }))
  }
  for (const g of d.goals) undos.push(updateUndoable('workoutGoals', g.id, { preferredWeekdays: wd === undefined ? [] : (g.preferredWeekdays ?? []).filter((x) => x !== wd) }))
  for (const w of d.workouts) undos.push(updateUndoable('workouts', w.id, { status: 'pulado' }))
  return all(undos)
}

// ─── "não faço mais yoga na terça" ──────────────────────────────────────────

const NOT_ANYMORE = /^(?:eu\s+)?(?:nao\s+(?:faco|tenho|vou|pratico|treino)\s+mais|parei\s+de(?:\s+fazer)?|nao\s+(?:faco|tenho)\s+(?:mais\s+)?nenhum(?:a)?)\s+(?:o |a |os |as )?(.+?)$/
const DAY_TAIL = /\s+(?:na|no|nas|nos|as|aos|toda|todo|todas|todos|de)\s+(segunda|terca|quarta|quinta|sexta|sabado|domingo)s?(?:-feira)?s?$/

function areaFor(db: DB, subject: string): MemoryArea {
  return modalityIds(db, subject).length ? 'esportes' : 'rotina'
}

function notAnymore(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = NOT_ANYMORE.exec(n)
  if (!m) return undefined
  const wd = weekdayIn(m[1])
  const subjectN = m[1].replace(DAY_TAIL, '').trim()
  if (!subjectN || subjectN.split(' ').length > 4) return undefined
  const mod = modalityIds(db, subjectN)[0]
  const label = mod ? (findModality(db.profile, mod)?.label ?? cap(subjectN)) : cap(subjectN)
  // Same key as the memory seed ('yoga.weekday'): Lumos updates the line instead of duplicating it.
  const key = `${slug(subjectN)}.${wd === undefined ? 'ativo' : 'weekday'}`
  const text = wd === undefined ? `Não faz mais ${label.toLowerCase()}` : `Não faz mais ${label.toLowerCase()} às ${WEEKDAY_PLURAL[wd]}`
  const stale = db.memory.filter((x) => x.status !== 'archived' && x.kind !== 'history' && norm(x.text).includes(norm(subjectN)) && (wd === undefined || norm(x.text).includes(normalize(WEEKDAY_LONG[wd]))) && x.key !== key)
  const defaults = defaultsTouching(db, subjectN, wd, now.date)
  const where = describeDefaults(defaults)
  const say = wd === undefined ? `${label.toLowerCase()} saiu da sua rotina` : `${label.toLowerCase()} não é mais na ${WEEKDAY_LONG[wd]}`
  return {
    area: AREA,
    text: `Anotado: ${say} ✓`,
    sub: countDefaults(defaults) ? `Ainda está no ${listJoin(where)}. Tiro de lá também? Isso muda o padrão, não só essa semana.` : undefined,
    options: countDefaults(defaults) ? [{ label: 'Tirar do padrão também', ask: `tira ${subjectN}${wd === undefined ? '' : ` de ${WEEKDAY_LONG[wd]}`} do padrão` }] : undefined,
    action: {
      mode: policyFor('memory'),
      run: () =>
        runLogged(() => all([...stale.map((s) => archiveMemory(s.id)), remember(now, { key, kind: 'state', area: areaFor(getDB(), subjectN), text })]), [
          eventDraft(now, { kind: 'learned', title: cap(say), area: areaFor(db, subjectN), ref: { type: 'memory', id: key } }),
        ]),
    },
  }
}

// ─── "tira yoga de terça do padrão" ─────────────────────────────────────────

const FROM_DEFAULT = /^(?:tira|tirar|remove|remover)\s+(?:o |a )?(.+?)\s+(?:de|da|do)\s+(?:(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\s+(?:do|da)\s+)?(?:padrao|template|rotina fixa)$/

function fromDefault(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = FROM_DEFAULT.exec(n)
  if (!m) return undefined
  const subject = m[1].trim()
  const wd = m[2] ? weekdayIn(m[2]) : undefined
  const d = defaultsTouching(db, subject, wd, now.date)
  if (!countDefaults(d)) return { area: AREA, text: `Não achei ${subject} no seu padrão${wd === undefined ? '' : ` de ${WEEKDAY_LONG[wd]}`} — já está fora 🙂` }
  const lines = [
    ...d.template.map((t) => ({ text: `Template de treinos · ${WEEKDAY_LONG[t.weekday]}: ${t.title ?? t.modalities.join(' / ')}`, emoji: '🗓️' })),
    ...d.events.map((e) => ({ text: `Agenda: ${e.title}${wd === undefined ? '' : ` (só a ${WEEKDAY_LONG[wd]})`}`, emoji: '📅' })),
    ...d.routine.map((i) => ({ text: `Rotina: ${i.title}`, emoji: '🌅' })),
    ...d.goals.map((g) => ({ text: `Meta “${g.title}”: sem ${wd === undefined ? 'dia preferido' : WEEKDAY_LONG[wd]} como preferido`, emoji: '🎯' })),
    ...(d.workouts.length ? [{ text: `${plural(d.workouts.length, 'treino já planejado sai', 'treinos já planejados saem')} da agenda`, emoji: '↩️' }] : []),
  ]
  return {
    area: AREA,
    text: `Isso muda o padrão${wd === undefined ? '' : ` de ${WEEKDAY_LONG[wd]}`} daqui pra frente:`,
    lines,
    action: {
      mode: policyFor('change_default'),
      label: 'Mudar o padrão',
      done: 'Padrão atualizado ✓ As semanas que vêm já saem sem isso.',
      run: () => runLogged(() => applyDefaults(d, wd), [eventDraft(now, { kind: 'changed', title: `${cap(subject)} saiu do padrão${wd === undefined ? '' : ` de ${WEEKDAY_LONG[wd]}`}`, area: areaFor(db, subject) })]),
    },
  }
}

// ─── "lembra que eu prefiro …" ──────────────────────────────────────────────

const REMEMBER = /^(?:lembra|lembre|lembre-se|saiba|anota|guarda)\s+(?:que|disso\s*:?)\s+(.+)$/
const PREFERENCE = /\b(prefiro|gosto|odeio|amo|curto|detesto|nao gosto|nao curto|quero|nao quero)\b/
const VERB_3P: [RegExp, string][] = [
  [/^(eu\s+)?nao gosto\b/, 'não gosta'],
  [/^(eu\s+)?nao quero\b/, 'não quer'],
  [/^(eu\s+)?prefiro\b/, 'prefere'],
  [/^(eu\s+)?gosto\b/, 'gosta'],
  [/^(eu\s+)?odeio\b/, 'odeia'],
  [/^(eu\s+)?amo\b/, 'ama'],
  [/^(eu\s+)?quero\b/, 'quer'],
  [/^(eu\s+)?moro\b/, 'mora'],
  [/^(eu\s+)?tenho\b/, 'tem'],
  [/^(eu\s+)?sou\b/, 'é'],
  [/^(eu\s+)?faco\b/, 'faz'],
  [/^(eu\s+)?trabalho\b/, 'trabalha'],
]

function thirdPerson(original: string): string {
  const n = normalize(original)
  for (const [re, rep] of VERB_3P) {
    const m = re.exec(n)
    if (m) return cap(`${rep}${original.slice(m[0].length)}`)
  }
  return cap(original.replace(/^eu\s+/i, ''))
}

function rememberThat(input: HandlerInput): LumosReply | undefined {
  const { n, now, text } = input
  const m = REMEMBER.exec(n)
  if (!m) return undefined
  if (/^anota\b/.test(n) && !/\beu\b/.test(m[1])) return undefined
  const start = n.indexOf(m[1])
  const body = text.normalize('NFC').slice(start).replace(/[.!]+$/, '').trim()
  const kind = PREFERENCE.test(m[1]) ? 'preference' : 'fact'
  const fact = thirdPerson(body)
  return {
    area: AREA,
    text: `Guardado ✓ ${fact}.`,
    sub: kind === 'preference' ? 'Fica como preferência sua.' : undefined,
    action: { mode: policyFor('memory'), run: () => runLogged(() => remember(now, { key: `marina.${slug(body).slice(0, 40)}`, kind, area: 'habitos', text: fact }), [eventDraft(now, { kind: 'learned', title: fact, area: 'habitos' })]) },
  }
}

// ─── pattern answers ────────────────────────────────────────────────────────

const YES = /^(?:sim|pode|isso|exato|pode sim|claro)[,!.]?\s*(?:pode\s+)?(?:considera(?:r)?|guarda(?:r)?)?\s*(?:isso\s+)?(?:como\s+preferencia)?\s*:?\s*(.*)$/
const NO = /^(?:nao|nao,?\s+foi\s+(?:so\s+)?(?:acaso|dessa vez))[,!.]?\s*(?:nao\s+)?(?:considera)?\s*:?\s*(.*)$/

function patternAnswer(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, ctx } = input
  const yes = /considera/.test(n) || ctx.lastRef?.type === 'memory' ? YES.exec(n) : null
  const no = !yes && (/considera/.test(n) || ctx.lastRef?.type === 'memory') ? NO.exec(n) : null
  const m = yes ?? no
  if (!m) return undefined
  const byText = m[1] ? findMemoryByText(db, m[1]) : undefined
  const item = byText ?? (ctx.lastRef?.type === 'memory' ? db.memory.find((x) => x.id === ctx.lastRef!.id) : undefined)
  if (!item || item.status !== 'observed') return undefined
  if (yes) {
    return {
      area: AREA,
      text: `Combinado — agora é preferência ✓ ${item.text}.`,
      action: {
        mode: policyFor('memory'),
        run: () => runLogged(() => updateUndoable('memory', item.id, { status: 'confirmed', kind: 'preference', source: 'marina', askedAt: nowISO() }), [eventDraft(now, { kind: 'learned', title: `Preferência: ${item.text}`, area: item.area, ref: { type: 'memory', id: item.id } })]),
      },
    }
  }
  return {
    area: AREA,
    text: 'Ok, fica como foi — não trato isso como regra ✓',
    action: { mode: policyFor('memory'), run: () => updateUndoable('memory', item.id, { askedAt: nowISO() }) },
  }
}

// ─── "o que você sabe sobre mim?" ───────────────────────────────────────────

const ABOUT_ME = /\bo que (?:voce|vc|a lumos) sabe (?:sobre|de) mim\b|\bminha memoria\b|\bo que voce lembra de mim\b/
const LAYER: Record<MemoryLayer, string> = { fact: 'Fatos', preference: 'Preferências', state: 'Agora', exception: 'Só dessa vez', pattern: 'Padrões que reparei' }

function aboutMe(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!ABOUT_ME.test(n)) return undefined
  const view = memoryView(db, now as Now)
  if (!view.length) return { area: AREA, text: 'Ainda sei pouco — vou aprendendo com o que você me conta, e nada vira regra sem você confirmar.', link: { label: 'O que Lumos sabe sobre mim', to: ROUTES.settings } }
  const order: MemoryLayer[] = ['state', 'preference', 'fact', 'pattern', 'exception']
  const sections = order
    .map((layer) => ({ layer, items: view.filter((v) => v.layer === layer) }))
    .filter((s) => s.items.length)
    .map((s) => ({ title: `${LAYER[s.layer]} (${s.items.length})`, lines: s.items.slice(0, 3).map((v) => ({ text: v.text, provenance: v.layer === 'pattern' ? ('inference' as const) : undefined })) }))
  return { area: AREA, text: `Sei ${plural(view.length, 'coisa', 'coisas')} sobre você — tudo editável.`, sections, link: { label: 'Ver e corrigir tudo', to: ROUTES.settings } }
}

export const memoryHandler: Handler = {
  id: 'memory',
  run(input) {
    return fromDefault(input) ?? notAnymore(input) ?? patternAnswer(input) ?? rememberThat(input) ?? aboutMe(input)
  },
}
