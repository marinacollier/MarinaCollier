/**
 * Proactive Lumos (Home): ONE line under the greeting, up to 3 contextual suggestions under the
 * composer, and 0–3 insights. Never a feed, never generic, never guilt. All from data + now.
 */
import type { DB } from '../types'
import { contextWorkouts } from '../fuel'
import { workMode } from '../planning'
import { isTaskOpen, prioritiesFor, upcomingTrips, waitingFor } from '../selectors'
import { prepChecklistFor, planFor } from '../mealprep'
import { startOfWeek, addDays, diffDays, hmToMinutes, weekday } from '@/lib/date'
import { capitalize, dayContext, dayLabel, lifeContext, trainingNoun, tripOpenItems } from './context'
import { isAcked, needsAttention } from './attention'
import { changeFeed } from './changes'
import { PATTERN_EVIDENCE } from './memory'
import type { Insight, Now } from './types'

const NUM = ['nenhuma', 'uma', 'duas', 'três', 'quatro', 'cinco']

function parts(db: DB) {
  const p = db.profile.dayParts ?? { morningStart: 4, middayStart: 11, eveningStart: 18 }
  return { morning: p.morningStart * 60, midday: p.middayStart * 60, evening: p.eveningStart * 60 }
}

function joinPt(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`
}

/** One short line under the greeting, or nothing. Morning: today in one breath. Evening: tomorrow's one thing. */
export function dailyBrief(db: DB, now: Now): string | undefined {
  const { midday, evening } = parts(db)
  if (now.minutes >= evening || now.minutes < 4 * 60) {
    const tomorrow = dayContext(db, addDays(now.date, 1), now)
    return tomorrow.notes[0]?.value
  }
  const today = dayContext(db, now.date, now)
  if (now.minutes < midday) {
    const bits: string[] = []
    const t = today.trainings.find((x) => !x.done && (!x.time || hmToMinutes(x.time) + (x.durationMin ?? 60) > now.minutes))
    if (t) {
      const w = contextWorkouts(db, now.date).find((x) => x.title === t.title)
      const noun = w ? trainingNoun(db, w.modality).noun : t.title.toLowerCase()
      bits.push(`${noun}${t.time && hmToMinutes(t.time) < 8 * 60 ? ' cedo' : ''}`)
    }
    if (today.workMode === 'presencial') bits.push('trabalho presencial')
    else if (today.workMode !== 'off') bits.push('trabalho')
    const top = prioritiesFor(db, now.date).filter((p) => !p.done).length
    if (top) bits.push(`${NUM[top] ?? top} ${top === 1 ? 'coisa realmente importante' : 'coisas realmente importantes'}`)
    if (!bits.length) return today.notes[0]?.value
    const evening = today.notes.find((n) => n.value.startsWith('Sua noite está livre'))
    return `Hoje você tem ${joinPt(bits)}.${evening ? ` ${evening.value}` : ''}`
  }
  return today.notes.find((n) => !n.value.startsWith('Sua noite'))?.value ?? today.notes[0]?.value
}

/** Max 3 context suggestions under the composer. Nothing generic: each one comes from something real. */
export function homeSuggestions(db: DB, now: Now): string[] {
  const { morning, midday, evening } = parts(db)
  const out: string[] = []
  const push = (s: string | undefined) => s && !out.includes(s) && out.push(s)
  const wd = weekday(now.date)
  const tomorrow = addDays(now.date, 1)
  const isEvening = now.minutes >= evening

  // Evening before a key / prep-heavy training.
  if (isEvening) {
    const key = contextWorkouts(db, tomorrow).find((w) => w.isKeySession || w.requiresPreviousDayPrep)
    if (key) {
      const { noun, g } = trainingNoun(db, key.modality)
      push(`prepara ${g === 'a' ? 'minha' : 'meu'} ${noun} de amanhã`)
    }
    if (workMode(db, tomorrow) === 'presencial') push('o que levo amanhã?')
  }

  // After a training (done, or ended in the last 3 hours and not logged).
  const timeline = dayContext(db, now.date, now)
  const ended = timeline.trainings.find((t) => t.time && hmToMinutes(t.time) + (t.durationMin ?? 60) <= now.minutes && now.minutes - (hmToMinutes(t.time) + (t.durationMin ?? 60)) <= 180)
  if (ended && !ended.done) push('registra meu treino')
  if (ended || timeline.trainings.some((t) => t.done)) if (!isEvening) push('como fica minha alimentação?')

  // Week planning moments: Monday morning, weekend evenings — unless the week is already planned.
  const planWs = startOfWeek(wd === 6 || wd === 0 ? addDays(now.date, 7) : now.date)
  const planned = db.weekPlans.some((p) => p.weekStart === planWs && p.confirmedAt)
  if (!planned && ((wd === 1 && now.minutes < midday) || ((wd === 0 || wd === 6) && isEvening))) push('monta minha semana')

  // Work hours.
  const work = db.profile.work
  const working = timeline.workMode !== 'off' && work && now.minutes >= hmToMinutes(work.start) && now.minutes < hmToMinutes(work.end)
  if (working) {
    if (needsAttention(db, now).length || db.tasks.some((t) => isTaskOpen(t) && t.needsMe)) push('o que precisa de mim?')
    if (waitingFor(db).length) push('o que estou esperando?')
    if (now.minutes < 14 * 60 && timeline.free.some((f) => hmToMinutes(f.start) >= 13 * 60)) push('organiza minha tarde')
  }

  // A trip close by with real open items.
  const trip = upcomingTrips(db, now.date).find((t) => t.startDate && t.startDate >= now.date && diffDays(now.date, t.startDate) <= 30)
  if (trip && tripOpenItems(db, trip, now.date).length) push('o que falta pra viagem?')

  // Meal prep weekend without a plan for next week.
  if ((wd === 6 || wd === 0) && db.nutritionDayPlans.some((p) => p.active) && !planFor(db, planWs)) push('faz minha feira')

  // Something changed since she last talked to Lumos.
  if (out.length < 3 && changeFeed(db, now).items.length >= 2) push('o que mudou?')

  // Last resort, still tied to the moment of the day.
  if (!out.length) {
    if (now.minutes >= morning && now.minutes < midday) push('o que eu tenho hoje?')
    else if (isEvening) push('me ajuda a organizar amanhã')
  }
  return out.slice(0, 3)
}

/** 0–3 really relevant insights, deduped, respecting attentionAcks. Never a notification feed. */
/** Lumos suggests a backup when the last one is this old. */
export const BACKUP_REMINDER_DAYS = 30

export function proactiveInsights(db: DB, now: Now, max = 3): Insight[] {
  const { evening } = parts(db)
  const out: Insight[] = []
  const tomorrow = addDays(now.date, 1)

  const attention = needsAttention(db, now)
  for (const a of attention.filter((a) => a.kind === 'conflict').slice(0, 1))
    out.push({ key: a.key, text: a.detail ?? a.title, ask: a.options?.[1]?.ask ?? a.options?.[0]?.ask, provenance: a.provenance, priority: 90 })

  if (now.minutes >= evening - 60) {
    const prep = prepChecklistFor(db, now.date).filter((p) => p.key.endsWith('separar-intra'))
    const done = new Set(planFor(db, now.date)?.checked ?? [])
    const missing = prep.filter((p) => !done.has(p.key))
    if (missing.length) {
      const key = contextWorkouts(db, tomorrow).find((w) => w.isKeySession || w.requiresIntraWorkout)
      const noun = key ? trainingNoun(db, key.modality) : undefined
      out.push({ key: `prep:${now.date}`, text: `Falta separar o intra ${noun ? `d${noun.g} ${noun.noun}` : 'do treino'} de amanhã.`, ask: noun ? `prepara ${noun.g === 'a' ? 'minha' : 'meu'} ${noun.noun} de amanhã` : undefined, provenance: 'inference', priority: 80 })
    }
    if (workMode(db, tomorrow) === 'presencial') out.push({ key: `presencial:${tomorrow}`, text: 'Amanhã é presencial — o kit já está montado.', ask: 'o que levo amanhã?', provenance: 'fact', priority: 70 })
  }

  for (const w of attention.filter((a) => a.kind === 'waiting_reply').slice(0, 1)) out.push({ key: w.key, text: `${w.title} — dá pra cobrar.`, ask: 'o que estou esperando?', provenance: 'fact', priority: 65 })

  const ctx = lifeContext(db, now)
  if (ctx.nextTrip && ctx.nextTrip.openItems && ctx.nextTrip.daysLeft <= 30)
    out.push({ key: `trip:${ctx.nextTrip.id}:${startOfWeek(now.date)}`, text: `${ctx.nextTrip.name} em ${ctx.nextTrip.daysLeft} ${ctx.nextTrip.daysLeft === 1 ? 'dia' : 'dias'} — ${ctx.nextTrip.openItems === 1 ? '1 coisa aberta' : `${ctx.nextTrip.openItems} coisas abertas`}.`, ask: 'o que falta pra viagem?', provenance: 'fact', priority: 60 })

  const pattern = (db.memory ?? []).find((m) => m.status === 'observed' && (m.evidence ?? 0) >= PATTERN_EVIDENCE && !m.askedAt)
  if (pattern) out.push({ key: `pattern:${pattern.id}`, text: `${pattern.text}. Quer que eu considere isso como preferência?`, ask: `sim, considera "${pattern.text}" como preferência`, provenance: 'inference', priority: 50 })

  // Monthly, discreet: everything lives on this device, so a file copy every ~30 days.
  const backupRef = db.profile.lastBackupAt ?? db.profile.onboardedAt
  if (backupRef) {
    const days = Math.floor((Date.parse(`${now.date}T12:00:00-03:00`) - Date.parse(backupRef)) / 86_400_000)
    if (days >= BACKUP_REMINDER_DAYS)
      out.push({
        key: `backup:${now.date.slice(0, 7)}`,
        text: db.profile.lastBackupAt ? `Seu último backup foi há ${days} dias. Quer gerar um agora?` : 'Você ainda não tem um backup dos seus dados. Quer gerar um agora?',
        ask: 'gera meu backup',
        provenance: 'fact',
        priority: 30,
      })
  }

  if (ctx.today.energy === 'baixa') out.push({ key: `energy:${now.date}`, text: `Energia baixa ${dayLabel(now.date, now.date)} — dá pra ir de versão curta.`, ask: 'organiza meu dia na versão curta', provenance: 'inference', priority: 40 })

  const seen = new Set<string>()
  return out
    .filter((i) => !isAcked(db, i.key, now.date) && !seen.has(i.key) && !!seen.add(i.key))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, Math.max(0, Math.min(max, 3)))
    .map((i) => ({ ...i, text: capitalize(i.text) }))
}
