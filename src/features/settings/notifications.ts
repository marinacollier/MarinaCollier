/**
 * Local reminders: which notifications are due right now. Pure function of (db, now, prefs).
 * The hook in ./useLocalReminders.ts shows them (only while the app is open).
 */
import type { DB, NotificationCategory, NotificationPref } from '@/data/types'
import { eventsFor, modalityOf, routineProgress, waitingFor, workoutsOn } from '@/data/selectors'
import { diffDays, hmToMinutes, inMinutesLabel, minutesOfDay, startOfWeek, todayKey, weekday } from '@/lib/date'
import { ROUTES } from '@/app/routes'
import { SEED_IDS } from '@/data/seed/ids'

export interface DueNotification {
  /** Stable per moment, used to show each reminder at most once. */
  id: string
  category: NotificationCategory
  title: string
  body: string
  /** In-app route to open on tap. */
  url: string
}

export const DEFAULT_LEAD: Partial<Record<NotificationCategory, number>> = { compromisso: 30, treino: 60 }

export function computeDueNotifications(db: DB, now: Date, prefs: NotificationPref[]): DueNotification[] {
  const pref = (c: NotificationCategory) => prefs.find((p) => p.category === c && p.enabled)
  const lead = (c: NotificationCategory) => pref(c)?.leadMinutes ?? DEFAULT_LEAD[c] ?? 30
  const today = todayKey(now)
  const nowMin = minutesOfDay(now)
  const parts = db.profile.dayParts
  const out: DueNotification[] = []

  if (pref('compromisso')) {
    const l = lead('compromisso')
    for (const e of eventsFor(db, today)) {
      if (e.allDay || !e.startTime) continue
      const delta = hmToMinutes(e.startTime) - nowMin
      if (delta < 0 || delta > l) continue
      out.push({
        id: `compromisso:${e.id}:${today}`,
        category: 'compromisso',
        title: `${e.title} ${inMinutesLabel(delta)}`,
        body: [e.startTime, e.location].filter(Boolean).join(' · '),
        url: ROUTES.agenda,
      })
    }
  }

  if (pref('deadline')) {
    for (const t of db.tasks) {
      if (t.dueDate !== today || t.status === 'done' || t.status === 'archived' || t.recurrence) continue
      out.push({
        id: `deadline:${t.id}:${today}`,
        category: 'deadline',
        title: `Prazo hoje: ${t.title}`,
        body: 'Quando der, dá uma olhada. 💪',
        url: ROUTES.today,
      })
    }
  }

  if (pref('treino')) {
    const l = lead('treino')
    for (const w of workoutsOn(db, today)) {
      if (w.status !== 'planejado') continue
      const m = modalityOf(db, w.modality)
      if (w.time) {
        const delta = hmToMinutes(w.time) - nowMin
        if (delta < 0 || delta > l) continue
      } else if (nowMin < parts.morningStart * 60) continue
      out.push({
        id: `treino:${w.id}:${today}`,
        category: 'treino',
        title: `${m.emoji} ${w.title || m.label} ${w.time ? inMinutesLabel(hmToMinutes(w.time) - nowMin) : 'hoje'}`,
        body: w.goal ?? 'Bora se mexer, no seu ritmo.',
        url: ROUTES.body,
      })
    }
  }

  if (pref('rotina')) {
    const inMorning = nowMin >= parts.morningStart * 60 && nowMin < parts.middayStart * 60
    const morning = db.routines.find((r) => r.id === SEED_IDS.routineMorning && r.active) ?? db.routines.find((r) => r.period === 'manha' && r.active)
    if (inMorning && morning) {
      const p = routineProgress(db, morning.id, today)
      if (p.total > 0 && p.done < p.total)
        out.push({
          id: `rotina:${morning.id}:${today}`,
          category: 'rotina',
          title: `${morning.emoji ?? '☀️'} ${morning.name}`,
          body: `${p.total - p.done} ${p.total - p.done === 1 ? 'item' : 'itens'} pra começar leve.`,
          url: ROUTES.today,
        })
    }
  }

  if (pref('viagem')) {
    for (const t of db.trips) {
      if (!t.startDate || t.status === 'concluida') continue
      const d = diffDays(today, t.startDate)
      if (d !== 7 && d !== 1) continue
      out.push({
        id: `viagem:${t.id}:${d}`,
        category: 'viagem',
        title: `${t.flag} ${t.name} ${d === 1 ? 'é amanhã!' : 'em 7 dias'}`,
        body: d === 1 ? 'Mala, documentos e reservas: confere o checklist.' : 'Bom momento pra revisar o que falta.',
        url: ROUTES.trip(t.id),
      })
    }
  }

  if (pref('waiting_for')) {
    const stale = waitingFor(db).filter((t) => t.waiting?.since && diffDays(t.waiting.since, today) > 7)
    if (stale.length)
      out.push({
        id: `waiting_for:${today}`,
        category: 'waiting_for',
        title: stale.length === 1 ? `Esperando ${stale[0].waiting?.who ?? 'retorno'} faz um tempo` : `${stale.length} coisas esperando retorno`,
        body: stale.length === 1 ? `${stale[0].title}. Vale um follow-up? 👀` : 'Vale um follow-up rápido? 👀',
        url: ROUTES.tasks,
      })
  }

  if (pref('revisao_semanal') && weekday(today) === 0 && nowMin >= parts.eveningStart * 60) {
    const weekStart = startOfWeek(today)
    const done = db.weeklyReviews.some((r) => r.weekStart === weekStart && r.completedAt)
    if (!done)
      out.push({
        id: `revisao_semanal:${weekStart}`,
        category: 'revisao_semanal',
        title: '🗓️ Revisão da semana',
        body: '10 minutinhos pra fechar a semana e planejar a próxima.',
        url: ROUTES.weeklyReview,
      })
  }

  return out
}

export const NOTIFICATION_META: Record<NotificationCategory, { label: string; text: string; emoji: string; leadOptions?: number[] }> = {
  compromisso: { label: 'Compromisso chegando', text: 'um aviso antes de cada compromisso', emoji: '📅', leadOptions: [10, 15, 30, 60] },
  deadline: { label: 'Prazo hoje', text: 'tarefas com prazo para hoje', emoji: '⏰' },
  treino: { label: 'Treino do dia', text: 'antes do treino planejado', emoji: '🏃‍♀️', leadOptions: [15, 30, 60, 120] },
  rotina: { label: 'Rotina da manhã', text: 'um lembrete leve de manhã', emoji: '☀️' },
  viagem: { label: 'Viagem chegando', text: 'faltando 7 dias e 1 dia', emoji: '✈️' },
  waiting_for: { label: 'Esperando retorno parado', text: 'quando algo espera há mais de 7 dias', emoji: '⏳' },
  revisao_semanal: { label: 'Revisão semanal', text: 'domingo à noite', emoji: '🗓️' },
}

export const NOTIFICATION_ORDER: NotificationCategory[] = ['compromisso', 'deadline', 'treino', 'rotina', 'viagem', 'waiting_for', 'revisao_semanal']
