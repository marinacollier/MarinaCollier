/** Small pt-BR phrasing helpers for Lumos's answers about the day. */
import type { DateKey, TimeHM } from '@/data/types'
import { diffDays, WEEKDAY_LONG, weekday } from '@/lib/date'
import { dayLabel } from '../agents/common'

/** "hoje" · "amanhã" · "na terça" · "no sábado" · "12 de out." */
export function onDay(date: DateKey, today: DateKey): string {
  const d = diffDays(today, date)
  if (d >= 2 && d < 7) {
    const wd = weekday(date)
    return `${wd === 0 || wd === 6 ? 'no' : 'na'} ${WEEKDAY_LONG[wd]}`
  }
  return dayLabel(date, today)
}

/** "de hoje" · "de amanhã" · "de terça" */
export function ofDay(date: DateKey, today: DateKey): string {
  const d = diffDays(today, date)
  if (d >= 2 && d < 7) return `de ${WEEKDAY_LONG[weekday(date)]}`
  return `de ${dayLabel(date, today)}`
}

/** "19h" · "19h30" */
export function hourLabel(t: TimeHM): string {
  const [h, m] = t.split(':')
  return `${Number(h)}h${m === '00' ? '' : m}`
}

/** Rough grammatical gender of a title's first word (Leitura → a, Inglês → o). */
export function isFeminine(title: string): boolean {
  const w = title.trim().split(/[\s/—-]+/)[0]?.toLowerCase() ?? ''
  return /(a|ção|cao|ão de|dade|agem|ia)$/.test(w) && !/(dia|treino)$/.test(w)
}

export function cancelledWord(title: string): string {
  return isFeminine(title) ? 'cancelada' : 'cancelado'
}
