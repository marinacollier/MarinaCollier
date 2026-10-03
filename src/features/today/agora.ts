/**
 * "Agora" engine — picks the ONE thing Marina should look at right now.
 * Pure function of (db, today, minutes). No randomness, no clock reads: easy to test.
 *
 * Order of attention (first match wins):
 *  1. something happening now / starting in ≤10 min        → "Agora"
 *  2. something starting within the next 75 min              → "Daqui a 40 min"
 *  3. morning routine still open (morning only)              → "Agora"
 *  4. meal window without that meal logged                   → "Agora"
 *  5. evening: day not closed yet (after 20h)                → "Agora"
 *  6. deadline today                                         → "Próximo"
 *  7. trip today/tomorrow                                    → "Próximo"
 *  8. first open priority of the Top 3                       → "Próximo"
 *  9. next timed thing later today                           → "Próximo"
 * 10. trip within 3 days                                     → "Próximo"
 * 11. gentle fallback
 */
import type { DateKey, DB, HomeWidgetId, MealSlot, Tone } from '@/data/types'
import type { SheetName } from '@/app/sheet-types'
import { ROUTES } from '@/app/routes'
import {
  agendaFor,
  checkinFor,
  isTaskOpen,
  mealsOn,
  nextTrip,
  type AgendaEntry,
} from '@/data/selectors'
import { prioritiesOf } from './priorities'
import { morningRoutine, routineView } from './routine'
import { countdownLabel, dayPart, diffDays, hmToMinutes, inMinutesLabel } from '@/lib/date'

export type AgoraAction =
  | { kind: 'sheet'; name: SheetName; props?: Record<string, unknown> }
  | { kind: 'route'; to: string }
  | { kind: 'scroll'; target: HomeWidgetId }

export interface AgoraPick {
  /** 'Agora' | 'Próximo' | 'Daqui a 40 min' */
  label: string
  emoji: string
  title: string
  subtitle?: string
  action: AgoraAction
  tone: Tone
  /** Which rule fired (useful for tests/analytics). */
  reason:
    | 'now'
    | 'soon'
    | 'routine'
    | 'meal'
    | 'closing'
    | 'deadline'
    | 'trip'
    | 'priority'
    | 'later'
    | 'fallback'
}

/** Meal windows in minutes of day. Gentle: only nudges inside the window. */
export const MEAL_WINDOWS: { slot: MealSlot; label: string; emoji: string; from: number; to: number }[] = [
  { slot: 'cafe', label: 'Hora do café da manhã', emoji: '☕', from: 6 * 60 + 30, to: 9 * 60 + 30 },
  { slot: 'almoco', label: 'Hora do almoço', emoji: '🥗', from: 11 * 60 + 45, to: 14 * 60 },
  { slot: 'jantar', label: 'Hora do jantar', emoji: '🍲', from: 19 * 60, to: 21 * 60 },
]

const SOON_MIN = 75
const NOW_LEAD = 10

function entryEnd(e: AgendaEntry): number {
  const start = hmToMinutes(e.time!)
  if (e.endTime) return Math.max(hmToMinutes(e.endTime), start + 1)
  return start + (e.kind === 'event' ? 60 : 45)
}

function entryAction(e: AgendaEntry, started: boolean): AgoraAction {
  if (e.kind === 'event') return { kind: 'sheet', name: 'event', props: { id: e.id } }
  if (e.kind === 'workout')
    return started
      ? { kind: 'sheet', name: 'workoutLog', props: { id: e.id } }
      : { kind: 'sheet', name: 'workout', props: { id: e.id } }
  return { kind: 'sheet', name: 'task', props: { id: e.id } }
}

function toneOf(e: AgendaEntry): Tone {
  const t = e.tone as Tone
  return ['accent', 'sage', 'ocean', 'sand', 'plum', 'ink'].includes(t) ? t : 'accent'
}

function soonLabel(min: number): string {
  return inMinutesLabel(min).replace(/^em /, 'Daqui a ')
}

export function pickAgora(db: DB, today: DateKey, minutes: number): AgoraPick {
  const part = dayPart(minutes, db.profile.dayParts)
  const timed = agendaFor(db, today).filter((e) => !e.allDay && e.time && !e.done)

  // 1. Happening now (or about to start).
  const current = timed.find((e) => {
    const start = hmToMinutes(e.time!)
    return start - NOW_LEAD <= minutes && minutes < entryEnd(e)
  })
  if (current) {
    const start = hmToMinutes(current.time!)
    return {
      label: 'Agora',
      emoji: current.emoji ?? '📅',
      title: `${current.title} às ${current.time}`,
      subtitle: minutes < start ? `começa ${inMinutesLabel(start - minutes)}` : current.subtitle ?? (current.endTime ? `até ${current.endTime}` : undefined),
      action: entryAction(current, minutes >= start),
      tone: toneOf(current),
      reason: 'now',
    }
  }

  // 2. Coming up soon.
  const upcoming = timed.filter((e) => hmToMinutes(e.time!) > minutes)
  const soon = upcoming.find((e) => hmToMinutes(e.time!) - minutes <= SOON_MIN)
  if (soon) {
    return {
      label: soonLabel(hmToMinutes(soon.time!) - minutes),
      emoji: soon.emoji ?? '📅',
      title: soon.title,
      subtitle: [`às ${soon.time}`, soon.subtitle].filter(Boolean).join(' · '),
      action: entryAction(soon, false),
      tone: toneOf(soon),
      reason: 'soon',
    }
  }

  // 3. Morning routine.
  if (part === 'manha') {
    const routine = morningRoutine(db)
    if (routine?.active) {
      const { done, total, mode } = routineView(db, routine, today)
      if (total > 0 && done < total) {
        return {
          label: 'Agora',
          emoji: routine.emoji ?? '☀️',
          title: mode === 'essential' ? `${routine.name} · ${routine.essentialName ?? 'Essential'}` : routine.name,
          subtitle: done === 0 ? `${total} coisinhas pra começar bem` : `${done} de ${total} ✓ — faltam ${total - done}`,
          // The routine lives in the Linha do dia unless Marina keeps the separate card visible.
          action: { kind: 'scroll', target: db.profile.homeWidgets.some((w) => w.id === 'manha' && w.visible) || !db.profile.homeWidgets.some((w) => w.id === 'linha_do_dia' && w.visible) ? 'manha' : 'linha_do_dia' },
          tone: 'sand',
          reason: 'routine',
        }
      }
    }
  }

  // 4. Meal window.
  const meals = mealsOn(db, today)
  const window = MEAL_WINDOWS.find((w) => minutes >= w.from && minutes < w.to)
  if (window && !meals.some((m) => m.slot === window.slot && m.done)) {
    const planned = meals.find((m) => m.slot === window.slot && m.planned)
    return {
      label: 'Agora',
      emoji: window.emoji,
      title: window.label,
      subtitle: planned ? `planejado: ${planned.description}` : 'registrar quando comer',
      action: planned
        ? { kind: 'sheet', name: 'meal', props: { id: planned.id } }
        : { kind: 'sheet', name: 'meal', props: { slot: window.slot, date: today } },
      tone: 'sage',
      reason: 'meal',
    }
  }

  // 5. Evening closing.
  if (part === 'noite' && minutes >= 20 * 60 && !checkinFor(db, today)?.closing) {
    return {
      label: 'Agora',
      emoji: '🌙',
      title: 'Encerrar o dia',
      subtitle: 'dois minutinhos pra fechar com leveza',
      action: { kind: 'sheet', name: 'dailyClosing', props: { date: today } },
      tone: 'plum',
      reason: 'closing',
    }
  }

  // 6. Deadlines today.
  const deadline = db.tasks
    .filter((t) => isTaskOpen(t) && t.status !== 'waiting' && t.dueDate === today && !t.recurrence)
    .sort((a, b) => a.order - b.order)[0]
  if (deadline) {
    return {
      label: 'Próximo',
      emoji: deadline.context === 'trabalho' ? '💻' : '⏳',
      title: deadline.title,
      subtitle: 'prazo hoje',
      action: { kind: 'sheet', name: 'task', props: { id: deadline.id } },
      tone: 'accent',
      reason: 'deadline',
    }
  }

  // 7 / 10. Trips close by.
  const trip = nextTrip(db, today)
  const tripDays = trip?.startDate ? diffDays(today, trip.startDate) : undefined
  const tripPick = (): AgoraPick => ({
    label: 'Próximo',
    emoji: trip!.flag || '✈️',
    title: trip!.name,
    subtitle: `${countdownLabel(trip!.startDate!, today)} · conferir o que falta`,
    action: { kind: 'route', to: ROUTES.trip(trip!.id) },
    tone: 'ocean',
    reason: 'trip',
  })
  if (trip && tripDays !== undefined && tripDays >= 0 && tripDays <= 1) return tripPick()

  // 8. Top 3.
  const priority = prioritiesOf(db, today).find((p) => !p.done)
  if (priority) {
    const task = priority.ref?.type === 'task' ? db.tasks.find((t) => t.id === priority.ref!.id) : undefined
    return {
      label: 'Próximo',
      emoji: task?.context === 'trabalho' ? '💻' : priorityEmoji(priority.ref?.type),
      title: priority.title,
      subtitle: 'uma das suas 3 de hoje',
      action: { kind: 'scroll', target: 'top3' },
      tone: 'accent',
      reason: 'priority',
    }
  }

  // 9. Later today.
  const later = upcoming[0]
  if (later) {
    return {
      label: 'Próximo',
      emoji: later.emoji ?? '📅',
      title: `${later.title} às ${later.time}`,
      subtitle: inMinutesLabel(hmToMinutes(later.time!) - minutes),
      action: entryAction(later, false),
      tone: toneOf(later),
      reason: 'later',
    }
  }

  if (trip && tripDays !== undefined && tripDays >= 0 && tripDays <= 3) return tripPick()

  // 11. Fallback.
  return part === 'noite'
    ? {
        label: 'Agora',
        emoji: '🌿',
        title: 'Nada marcado. Descansa.',
        subtitle: 'se algo estiver na cabeça, tira daí',
        action: { kind: 'sheet', name: 'brainDump' },
        tone: 'sage',
        reason: 'fallback',
      }
    : {
        label: 'Agora',
        emoji: '🌿',
        title: 'Nada marcado agora',
        subtitle: 'um bom momento pra escolher suas 3 de hoje',
        action: { kind: 'sheet', name: 'priorities', props: { date: today } },
        tone: 'sage',
        reason: 'fallback',
      }
}

function priorityEmoji(type?: string): string {
  switch (type) {
    case 'workout':
      return '🏃‍♀️'
    case 'studyItem':
      return '📚'
    case 'tripItem':
    case 'trip':
      return '✈️'
    case 'project':
      return '💻'
    default:
      return '✨'
  }
}
