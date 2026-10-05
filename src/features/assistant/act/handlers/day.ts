/**
 * The day and the week, by conversation (LifeContext · NeedsAttention · ChangeFeed · SmartPlanner):
 *   "o que eu tenho hoje?"            → only what matters, from now on + whether the evening is free
 *   "bom dia" / "resumo do dia"       → daily brief + "quer organizar comigo?"
 *   "organiza meu dia"                → Hoje importa (max 3), written directly with Desfazer
 *   "amanhã fiquei presencial"        → per-day work override + the presencial kit (direct + Desfazer)
 *   "o que realmente precisa de mim?" → ONE queue, tappable answers, "deixa pra lá"
 *   "o que mudou desde ontem?"        → real deltas
 *   "monta minha semana"              → preview by layer → "Aplicar semana" (confirm: many records)
 *   "terminei o treino" / "terminei <tarefa>" → done, with Desfazer
 */
import { ROUTES } from '@/app/routes'
import type { Now } from '@/data/intel'
import { keySessionTomorrow } from '@/data/fuel'
import { PERIOD_LABEL } from '@/data/planning'
import { isTaskOpen, prioritiesFor } from '@/data/selectors'
import { dayTimeline, isAnytime, startMin, endMin } from '@/data/timeline'
import type { DateKey, DB, DayPriority, Task, TimelineEntry, WorkDayMode } from '@/data/types'
import { addDays, greeting, hmToMinutes, minutesToHM, startOfWeek, WEEKDAY_SHORT, weekday, formatDayMonth, relativeDay } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { capitalize, listJoin, plural } from '../../agents/common'
import { presencialKitFor } from '../../mealprep-adapter'
import { ofDay, onDay } from '../../day/text'
import { attentionFor, briefFor, changesSince, contextOf, MODE_TEXT, startOfDayISO, weekFor, withWorkMode, workModeChange, workModeOn } from '../intel'
import { all, createUndoable, eventDraft, runLogged, updateUndoable } from '../log'
import { policyFor } from '../policy'
import { dayIn, matchTitle } from '../text'
import type { Handler, HandlerInput, LumosReply, ReplyLine, ReplySection, Undo } from '../types'

const RELEVANT = new Set<TimelineEntry['kind']>(['workout', 'event', 'work', 'task'])
const NUM_FEM = ['nenhuma', 'uma', 'duas', 'três']

/** What really shapes a day: trainings, events, work and timed tasks (no routine steps, no meals). */
export function relevantEntries(db: DB, date: DateKey, fromMin = 0): TimelineEntry[] {
  return dayTimeline(db, date).filter((e) => {
    if (!RELEVANT.has(e.kind) || e.status === 'cancelled' || e.status === 'done') return false
    if (e.kind === 'work' && /desloc/i.test(e.title)) return false
    if (e.kind === 'task' && isAnytime(e)) return false
    const end = endMin(e) ?? startMin(e)
    return end === undefined || end > fromMin
  })
}

function when(e: TimelineEntry): string {
  if (e.timeSource === 'approx' && e.window) {
    const p = Object.entries(PERIOD_LABEL).find(([k]) => e.subtitle?.toLowerCase().startsWith(PERIOD_LABEL[k as keyof typeof PERIOD_LABEL].toLowerCase()))
    return p ? `à ${p[1].toLowerCase()}` : `entre ${e.window.start} e ${e.window.end}`
  }
  if (isAnytime(e)) return 'sem horário'
  if (e.kind === 'work') return `${e.start}–${e.end}`
  return `às ${e.start}`
}

function eveningFree(db: DB, entries: TimelineEntry[]): boolean {
  const evening = db.profile.dayParts.eveningStart * 60
  return !entries.some((e) => (endMin(e) ?? startMin(e) ?? 0) > evening)
}

function rowOf(e: TimelineEntry): ReplyLine {
  return { text: e.title, emoji: e.emoji ?? (e.kind === 'work' ? '💻' : e.kind === 'event' ? '📅' : '•'), sub: capitalize(when(e)) }
}

// ─── "o que eu tenho hoje?" ─────────────────────────────────────────────────

const TODAY = /\bo que (?:eu )?(?:tenho|tem|rola)(?: pra)? (hoje|amanha|agora)\b|\bcomo (?:e|esta|ta|vai ser|fica) (?:o )?meu dia\b|\bminha agenda (?:de |pra )?(hoje|amanha)\b|\bo que tem no meu dia\b/

function today(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!TODAY.test(n)) return undefined
  const date = /\bamanha\b/.test(n) ? addDays(now.date, 1) : now.date
  const from = date === now.date ? now.minutes : 0
  const entries = relevantEntries(db, date, from)
  const label = date === now.date ? 'Hoje' : 'Amanhã'
  const mode = workModeOn(db, date)
  const free = eveningFree(db, entries)
  if (!entries.length) {
    return { area: 'seu dia', text: `${label} ${date === now.date ? 'não tem mais nada marcado' : 'está livre'} ✨${mode === 'off' ? '' : ` Trabalho ${MODE_TEXT[mode]}.`}`, options: [{ label: 'Organiza comigo', ask: date === now.date ? 'organiza meu dia' : 'monta minha semana' }] }
  }
  const named = entries.slice(0, 4).map((e) => `${e.kind === 'work' ? e.title.toLowerCase() : e.title} ${when(e)}`)
  const notes = contextOf(db, now)?.[date === now.date ? 'today' : 'tomorrow'].notes ?? []
  return {
    area: 'seu dia',
    text: `${label}${date === now.date && now.minutes > 6 * 60 ? ' ainda' : ''} tem ${listJoin(named)}${entries.length > 4 ? ` e mais ${entries.length - 4}` : ''}.${free ? ` Sua noite ${date === now.date ? 'está' : 'fica'} livre.` : ''}`,
    lines: [...notes.slice(0, 2).map((s) => ({ text: s.value, emoji: '✨', provenance: s.provenance })), ...entries.map(rowOf)],
    options: [{ label: 'Quer organizar comigo?', ask: date === now.date ? 'organiza meu dia' : 'organiza amanhã' }],
    link: { label: 'Abrir Agenda', to: ROUTES.agenda },
  }
}

// ─── Daily brief ────────────────────────────────────────────────────────────

const BRIEF = /^(?:bom dia|boa tarde|boa noite)(?:,? lumos)?$|\bresumo do (?:meu )?dia\b|\bme (?:da|faz|manda) (?:o |um )?(?:brief|resumo)\b|\bmeu brief\b/

function importantToday(db: DB, date: DateKey): Task[] {
  return db.tasks.filter((t) => isTaskOpen(t) && t.status !== 'waiting' && !t.recurrence && (t.needsMe || (t.dueDate && t.dueDate <= addDays(date, 1)) || t.date === date || t.bucket === 'hoje' || t.priority === 'alta'))
}

export function composeBrief(db: DB, now: Now): string {
  const date = now.date
  const entries = relevantEntries(db, date, now.minutes)
  const bits: string[] = []
  for (const e of entries.filter((x) => x.kind === 'workout').slice(0, 2)) bits.push(`${e.title.toLowerCase()}${e.start && hmToMinutes(e.start) < 8 * 60 ? ' cedo' : e.start ? ` às ${e.start}` : ''}`)
  const mode = workModeOn(db, date)
  if (mode === 'presencial') bits.push('trabalho presencial')
  else if (mode !== 'off') bits.push('trabalho')
  for (const e of entries.filter((x) => x.kind === 'event').slice(0, 1)) bits.push(`${e.title} ${when(e)}`)
  const top = prioritiesFor(db, date).filter((p) => !p.done)
  const imp = top.length || Math.min(3, importantToday(db, date).length)
  if (imp) bits.push(`${NUM_FEM[imp] ?? imp} ${imp === 1 ? 'coisa realmente importante' : 'coisas realmente importantes'}`)
  const head = `${greeting(now.minutes)}.`
  const body = bits.length ? ` Hoje você tem ${listJoin(bits)}.` : ' Hoje está leve.'
  const evening = eveningFree(db, entries) && now.minutes < db.profile.dayParts.eveningStart * 60 + 120 ? ' Sua noite está livre.' : ''
  return `${head}${body}${evening}`
}

function brief(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!BRIEF.test(n)) return undefined
  const engine = briefFor(db, now)
  const text = engine ? `${greeting(now.minutes)}. ${engine}` : composeBrief(db, now)
  return { area: 'seu dia', text, sub: 'Quer organizar comigo?', options: [{ label: 'Organiza meu dia', ask: 'organiza meu dia' }, { label: 'O que precisa de mim?', ask: 'o que realmente precisa de mim?' }] }
}

// ─── "organiza meu dia" → Hoje importa ──────────────────────────────────────

const ORGANIZE = /\b(?:organiza|organizar|monta|montar|planeja|planejar|arruma|arrumar)\b.*\b(?:meu dia|o dia|hoje|minha tarde|minha manha|amanha)\b|\b(?:quais|escolhe|escolher) (?:sao )?(?:as )?(?:minhas )?prioridades\b|\bhoje importa\b/

interface Pick {
  title: string
  ref?: DayPriority['ref']
  why: string
}

function freeWindows(db: DB, date: DateKey, fromMin: number): { start: string; end: string }[] {
  const sleep = hmToMinutes(db.profile.rhythm.sleepTime)
  const busy = relevantEntries(db, date, fromMin)
    .filter((e) => !isAnytime(e))
    .map((e) => [startMin(e)!, endMin(e) ?? startMin(e)! + 30] as const)
    .sort((a, b) => a[0] - b[0])
  const out: { start: string; end: string }[] = []
  let cursor = Math.max(fromMin, hmToMinutes(db.profile.rhythm.wakeTime))
  for (const [s, e] of busy) {
    if (s - cursor >= 45) out.push({ start: minutesToHM(cursor), end: minutesToHM(s) })
    cursor = Math.max(cursor, e)
  }
  if (sleep - cursor >= 45) out.push({ start: minutesToHM(cursor), end: minutesToHM(sleep) })
  return out.slice(0, 3)
}

export function pickPriorities(db: DB, date: DateKey): Pick[] {
  const picks: Pick[] = []
  const tasks = importantToday(db, date).sort(
    (a, b) => Number(!!b.needsMe) - Number(!!a.needsMe) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || Number(b.priority === 'alta') - Number(a.priority === 'alta') || a.order - b.order,
  )
  for (const t of tasks.slice(0, 2)) picks.push({ title: t.title, ref: { type: 'task', id: t.id }, why: t.needsMe ? 'precisa de você' : t.dueDate ? `prazo ${relativeDay(t.dueDate, date)}` : t.priority === 'alta' ? 'prioridade alta' : 'planejado pra hoje' })
  const key = dayTimeline(db, date).find((e) => e.kind === 'workout' && e.status === 'pending' && db.workouts.find((w) => w.id === e.ref.id)?.isKeySession)
  if (key && picks.length < 3) picks.push({ title: `Treino: ${key.title}`, ref: key.ref.type === 'workout' ? { type: 'workout', id: key.ref.id } : undefined, why: 'sessão-chave' })
  const tomorrowKey = keySessionTomorrow(db, date)
  const tomorrowPresencial = workModeOn(db, addDays(date, 1)) === 'presencial'
  if (picks.length < 3 && (tomorrowKey || tomorrowPresencial)) picks.push({ title: 'Preparar amanhã', why: tomorrowPresencial ? 'amanhã é presencial' : `amanhã tem ${tomorrowKey!.title ?? 'treino-chave'}` })
  for (const t of tasks.slice(2)) if (picks.length < 3) picks.push({ title: t.title, ref: { type: 'task', id: t.id }, why: 'também pra hoje' })
  return picks.slice(0, 3)
}

function organize(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!ORGANIZE.test(n)) return undefined
  if (/\bsemana\b/.test(n)) return undefined
  const date = /\bamanha\b/.test(n) ? addDays(now.date, 1) : now.date
  const existing = prioritiesFor(db, date)
  const free = freeWindows(db, date, date === now.date ? now.minutes : 0)
  const freeLine: ReplyLine[] = free.length ? [{ text: `Livre: ${free.map((f) => `${f.start}–${f.end}`).join(' · ')}`, emoji: '🌿' }] : []
  if (existing.length) {
    return {
      area: 'hoje importa',
      text: `${capitalize(onDay(date, now.date))} já tem ${plural(existing.length, 'prioridade', 'prioridades')} — mantive como você escolheu.`,
      lines: [...existing.map((p, i) => ({ text: `${String(i + 1).padStart(2, '0')} ${p.title}`, sub: p.done ? 'feito ✓' : undefined })), ...freeLine],
    }
  }
  const picks = pickPriorities(db, date)
  if (!picks.length) return { area: 'hoje importa', text: `Nada pedindo prioridade ${onDay(date, now.date)} — dia pra ir no seu ritmo ✨`, lines: freeLine }
  return {
    area: 'hoje importa',
    text: `${capitalize(onDay(date, now.date))} importa${picks.length === 1 ? '' : 'm'} ${picks.length === 1 ? 'uma coisa' : `${NUM_FEM[picks.length]} coisas`}. Já deixei no seu Início ✓`,
    lines: [...picks.map((p, i) => ({ text: `${String(i + 1).padStart(2, '0')} ${p.title}`, sub: p.why, provenance: 'suggestion' as const })), ...freeLine],
    action: {
      mode: policyFor('day_priorities'),
      run: () =>
        runLogged(() => all(picks.map((p, i) => createUndoable('priorities', { date, title: p.title, order: i, done: false, ref: p.ref }).undo)), [
          eventDraft(now, { kind: 'created', date, title: `Prioridades ${ofDay(date, now.date)}: ${listJoin(picks.map((p) => p.title))}`, area: 'rotina', provenance: 'suggestion' }),
        ]),
    },
  }
}

// ─── "amanhã fiquei presencial" ─────────────────────────────────────────────

const PRESENCIAL = /\b(?:fiquei|fico|vou ficar|vou|vai ser|virou|passou a ser|sera|estarei|to|tou|estou)\b.*\b(presencial|remoto|remota|em casa|home office)\b/

function workMode(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  if (text.trim().endsWith('?')) return undefined
  const m = PRESENCIAL.exec(n)
  if (!m) return undefined
  if (/\b(cozinhar|comer|marmita|treino)\b/.test(n)) return undefined
  const mode: WorkDayMode = m[1] === 'presencial' ? 'presencial' : 'remoto'
  const date = dayIn(n, now.date) ?? now.date
  const current = workModeOn(db, date)
  const kitDb = mode === 'presencial' ? (current === 'presencial' ? db : withWorkMode(db, date, 'presencial')) : undefined
  const kit = kitDb ? presencialKitFor(kitDb, date) : undefined
  const kitLines: ReplyLine[] = kit ? kit.lines.map((l) => ({ text: l.title, sub: [l.time, l.tags.join(' ')].filter(Boolean).join(' · ') || undefined, emoji: '🍱' })) : []
  const prep: ReplyLine[] = kit ? kit.checklist.map((c) => ({ text: c.title, sub: `${c.date === date ? capitalize(relativeDay(date, now.date)) : 'Na véspera'} · ${c.time}`, emoji: '🎒' })) : []
  const sections: ReplySection[] = []
  if (kitLines.length) sections.push({ title: kit!.title, lines: kitLines })
  if (prep.length) sections.push({ title: 'Checklist', lines: prep })
  const dayWord = onDay(date, now.date)
  if (current === mode) {
    return {
      area: 'trabalho',
      text: `${capitalize(dayWord)} já é ${MODE_TEXT[mode]} ✓${kit ? ' O kit já está montado:' : ''}`,
      sub: kit?.intro,
      sections,
      link: kit ? { label: 'Abrir Meal prep', to: ROUTES.mealPrep } : undefined,
    }
  }
  const graph = workModeChange(db, date, mode, now)
  return {
    area: 'trabalho',
    text: mode === 'presencial' ? `Feito: ${dayWord} fica presencial ✓${kit ? ' Montei tudo no esquema pegou e saiu.' : ''}` : `Feito: ${dayWord} fica ${MODE_TEXT[mode]} ✓ Nada de marmita pra levar.`,
    sub: kit?.intro,
    lines: graph.lines.slice(1).map((l) => ({ text: l.text, provenance: l.provenance })),
    sections,
    link: kit ? { label: 'Abrir Meal prep', to: ROUTES.mealPrep } : undefined,
    action: { mode: graph.sensitive ? 'confirm' : policyFor('work_mode'), label: 'Confirmar', run: () => graph.apply() },
  }
}

// ─── NeedsAttention ─────────────────────────────────────────────────────────

const ATTENTION = /\bo que (?:realmente |de fato |mesmo )?precisa (?:de mim|da minha atencao|de atencao)\b|\bo que depende de mim\b|\bo que (?:eu )?preciso decidir\b|^precisa de mim$/

function attention(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!ATTENTION.test(n)) return undefined
  const items = attentionFor(db, now)
  if (!items.length) return { area: 'precisa de você', text: 'Nada precisa de você agora ✨ O resto eu sigo cuidando.' }
  const shown = items.slice(0, 5)
  return {
    area: 'precisa de você',
    text: items.length === 1 ? 'Só uma coisa precisa de você:' : `${capitalize(NUM_FEM[items.length] ?? String(items.length))} coisas precisam de você:`,
    lines: shown.map((it) => ({
      text: it.title,
      sub: it.detail,
      provenance: it.provenance === 'fact' || it.provenance === 'user' ? undefined : it.provenance,
      options: [
        ...(it.options ?? []).map((o) => ({ label: o.label, ask: o.ask })),
        {
          label: 'Deixa pra lá',
          act: {
            done: `Ok, tirei “${it.title}” da fila.`,
            run: (): Undo => runLogged(() => createUndoable('attentionAcks', { key: it.key, how: 'dismissed' }).undo, [eventDraft(now, { kind: 'resolved', title: `Dispensou: ${it.title}`, area: 'uso_app', provenance: 'user' })]),
          },
        },
      ],
    })),
    sub: items.length > shown.length ? `E mais ${items.length - shown.length} — vamos uma de cada vez.` : undefined,
  }
}

// ─── ChangeFeed ─────────────────────────────────────────────────────────────

const CHANGES = /\bo que mudou\b|\bquais (?:foram )?(?:as )?mudancas\b|\bo que (?:aconteceu|rolou) desde\b/
const BY: Record<string, string> = { marina: 'você', lumos: 'Lumos', integration: 'integração', system: 'automático' }

function changes(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!CHANGES.test(n)) return undefined
  const since = /\bontem\b/.test(n)
    ? startOfDayISO(addDays(now.date, -1))
    : /\bhoje\b/.test(n)
      ? startOfDayISO(now.date)
      : /\bsemana\b/.test(n)
        ? startOfDayISO(startOfWeek(now.date))
        : undefined
  const feed = changesSince(db, now, since)
  const items = feed.items.slice(0, 6)
  return {
    area: 'o que mudou',
    text: feed.summary,
    lines: items.map((i) => ({
      text: i.title,
      sub: [new Date(i.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit' }), BY[i.by] ?? i.by].join(' · '),
      provenance: i.provenance === 'fact' || i.provenance === 'user' ? undefined : i.provenance,
    })),
    sub: feed.items.length > items.length ? `E mais ${feed.items.length - items.length} pequenas.` : undefined,
  }
}

// ─── SmartPlanner ───────────────────────────────────────────────────────────

const WEEK = /\b(?:monta|montar|organiza|organizar|planeja|planejar|faz|fazer|arruma)\b.*\b(?:minha semana|a semana|semana que vem|proxima semana|(?:meus )?to-?dos? (?:dessa|da|desta) semana|tarefas (?:dessa|da|desta) semana)\b/
const LAYER_EMOJI: Record<string, string> = { fixo: '📌', treino_chave: '🔥', preparo: '🍱', prazo: '⏳', estudo: '📚', vida: '🌿', descanso: '😴' }

function week(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!WEEK.test(n)) return undefined
  const p = weekFor(db, now)
  const sections: ReplySection[] = p.days
    .filter((d) => d.items.length || d.free.length)
    .map((d) => ({
      title: `${WEEKDAY_SHORT[weekday(d.date)]} ${formatDayMonth(d.date)}`,
      lines: [
        ...d.items.map((i) => ({ text: `${i.time ? `${i.time} · ` : ''}${i.title}`, emoji: LAYER_EMOJI[i.layer] ?? '•', isNew: i.isNew, provenance: i.provenance === 'fact' || i.provenance === 'user' ? undefined : i.provenance })),
        ...(d.free.length ? [{ text: `Livre: ${d.free.map((f) => `${f.start}–${f.end}`).join(' · ')}`, emoji: '🌿' }] : []),
      ],
    }))
  if (p.conflicts.length) sections.unshift({ title: '⚠️ Pra decidir', lines: p.conflicts.map((c) => ({ text: c.text, sub: `${WEEKDAY_SHORT[weekday(c.date)]} ${formatDayMonth(c.date)}` })) })
  const news = p.days.reduce((s, d) => s + d.items.filter((i) => i.isNew).length, 0)
  return {
    area: 'sua semana',
    text: `Semana de ${formatDayMonth(p.weekStart)}: ${p.summary || 'montei por camadas — fixos, treinos-chave, preparo, prazos, estudo e vida.'}`,
    sub: news ? `${plural(news, 'coisa nova', 'coisas novas')} entra${news === 1 ? '' : 'm'} quando você aplicar. Descanso e espaço livre ficam preservados.` : 'Nada novo pra colocar — sua semana já está montada.',
    sections,
    options: [{ label: 'Mudar algo', prefill: 'na semana, ' }],
    link: { label: 'Abrir planejador', to: ROUTES.weekPlanner },
    action: news ? { mode: policyFor('plan_week'), label: 'Aplicar semana', done: 'Semana aplicada ✓ Tá tudo na Agenda.', run: () => p.apply() } : undefined,
  }
}

// ─── "terminei o treino" / "terminei <tarefa>" ──────────────────────────────

const DONE = /^(?:ja\s+)?(?:terminei|fiz|conclui|finalizei|acabei|mandei|enviei|resolvi|entreguei|treinei|registra)\b\s*(?:de\s+)?(?:o |a |os |as |meu |minha )?(.*)$/

function done(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = DONE.exec(n)
  if (!m) return undefined
  const rest = m[1].trim()
  const isTraining = /^treinei/.test(n) || /^(?:meu\s+)?treino\b/.test(rest) || db.profile.modalities.some((mo) => rest.startsWith(mo.label.toLowerCase()) || rest.startsWith(mo.id))
  if (isTraining) {
    const entries = dayTimeline(db, now.date).filter((e) => e.kind === 'workout' && e.status === 'pending' && e.ref.type === 'workout')
    const byMod = entries.find((e) => rest && e.title.toLowerCase().includes(rest.replace(/^treino\s*(de\s*)?/, '').trim()) && rest.replace(/^treino\s*/, '').trim())
    const e = byMod ?? entries.find((x) => (startMin(x) ?? 0) <= now.minutes) ?? entries[0]
    if (!e) return undefined
    const w = db.workouts.find((x) => x.id === e.ref.id)!
    return {
      area: 'treino',
      text: `${e.title} registrado ✓ Bom demais.`,
      sub: w.isKeySession ? 'Foi sessão-chave — quer ver como fica sua alimentação no resto do dia?' : undefined,
      ref: { type: 'workout', id: w.id },
      options: [{ label: 'Como fica minha alimentação?', ask: 'Como estão meus macros hoje?' }],
      action: {
        mode: policyFor('complete_task'),
        run: () => runLogged(() => updateUndoable('workouts', w.id, { status: 'feito', durationMin: w.durationMin ?? w.plannedDurationMin }), [eventDraft(now, { kind: 'done', title: `Treinou: ${e.title}`, area: 'esportes', ref: { type: 'workout', id: w.id } })]),
      },
    }
  }
  if (!rest || rest.split(' ').length > 8) return undefined
  const open = db.tasks.filter((t) => isTaskOpen(t) && t.status !== 'waiting' && !t.recurrence)
  const t = matchTitle(open, rest)
  if (!t) return undefined
  return {
    area: 'feito',
    text: `“${t.title}” feito ✓`,
    ref: { type: 'task', id: t.id },
    action: { mode: policyFor('complete_task'), run: () => runLogged(() => updateUndoable('tasks', t.id, { status: 'done', completedAt: nowISO() }), [eventDraft(now, { kind: 'done', title: `Feito: ${t.title}`, area: t.context === 'trabalho' ? 'trabalho' : 'rotina', ref: { type: 'task', id: t.id } })]) },
  }
}

export const dayHandler: Handler = {
  id: 'day',
  run(input) {
    return workMode(input) ?? attention(input) ?? changes(input) ?? week(input) ?? organize(input) ?? today(input) ?? brief(input) ?? done(input)
  },
}
