/**
 * Calendar by conversation — ONE action (create_calendar_event) for every channel:
 *   typed   "aniversário da Ana sábado 20h no Bar X"
 *   spoken  "coloca aniversário da Ana sábado às oito"   (the transcript lands here like typed text)
 *   print   an invite read by the Attachment Understanding Layer, + her sentence for the intent
 *           ("coloca isso na agenda" → straight in; nothing said → "Encontrei um convite… Adicionar?")
 * Nothing is invented: no month → "17 de qual mês?"; no time → all-day, said out loud; same event on
 * the same day → not duplicated.
 */
import { createCalendarEvent, draftComplete, eventDraftFromText, findSameEvent, looksLikeEvent, type EventDraft } from '@/data/calendar/events'
import { addDays, formatDayMonth, MONTHS } from '@/lib/date'
import { lex } from '../../adjust/lexicon'
import { policyFor } from '../policy'
import type { Handler, HandlerInput, LumosReply, ReplyOption } from '../types'

const AREA = 'agenda'
/** She is telling Lumos to put it in (vs just sending a print). */
const SAVE = /\b(coloca|coloque|adiciona|adicione|bota|marca|marque|agenda|agende|salva|salve|guarda|guarde|cria|crie|anota|anote|poe|pode colocar|pode salvar)\b|\bna agenda\b/
const SKIP = /^(?:(?:eu\s+)?preciso\s+(?:lembrar\s+(?:de\s+)?)?|me\s+lembra\s+)/

function when(d: EventDraft): string {
  return `${formatDayMonth(d.date!)}${d.startTime ? ` · ${d.startTime}${d.endTime ? `–${d.endTime}` : ''}` : ' · dia inteiro'}`
}

function lines(d: EventDraft): LumosReply['lines'] {
  return [{ text: d.title ?? 'Evento', emoji: '📅', sub: [d.date ? when(d) : undefined, d.location].filter(Boolean).join(' · ') || undefined }]
}

/** The months a bare "dia 17" could mean (next three that have that day). */
function monthOptions(d: EventDraft, today: string, save: (draft: EventDraft) => ReplyOption['act']): ReplyOption[] {
  const out: ReplyOption[] = []
  for (let i = 0; i < 120 && out.length < 3; i++) {
    const day = addDays(today, i)
    if (+day.slice(8) !== d.dayOfMonth) continue
    const draft: EventDraft = { ...d, date: day, missing: d.missing.filter((f) => f !== 'month') }
    out.push({ label: `${d.dayOfMonth} de ${MONTHS[+day.slice(5, 7) - 1]}`, act: save(draft) })
  }
  return out
}

export function calendarReply(input: HandlerInput, d: EventDraft, explicit: boolean): LumosReply {
  const { db, now } = input
  const save = (draft: EventDraft): NonNullable<ReplyOption['act']> => ({
    done: `${draft.title} na agenda ✓ ${when(draft)}`,
    run: () => createCalendarEvent(draft, 'lumos').undo,
  })
  const fromPrint = !!d.sourceAttachment
  if (!d.title)
    return { area: AREA, text: 'Qual é o nome do evento?', options: [{ label: 'Dizer o nome', prefill: `${d.date ? `${formatDayMonth(d.date)} ` : ''}` }] }
  if (d.missing.includes('month') && d.dayOfMonth)
    return {
      area: AREA,
      text: `${fromPrint ? 'Encontrei um convite, mas não diz o mês. ' : ''}${d.dayOfMonth} de qual mês?`,
      lines: lines(d),
      options: monthOptions(d, now.date, save),
    }
  if (!d.date)
    return { area: AREA, text: `${fromPrint ? 'Encontrei um evento, mas sem data. ' : ''}Pra que dia é “${d.title}”?`, options: [{ label: 'Dizer o dia', prefill: `${d.title} ` }] }
  const same = findSameEvent(db, d)
  if (same) return { area: AREA, text: `“${same.title}” já está na agenda em ${formatDayMonth(same.date)} ✓ Não dupliquei.`, ref: { type: 'event', id: same.id } }
  const noTime = !d.startTime ? (fromPrint ? 'O convite não diz horário — salvo como dia inteiro.' : 'Sem horário — fica como dia inteiro.') : undefined
  if (!explicit || d.confidence === 'low')
    return {
      area: AREA,
      text: fromPrint ? 'Encontrei um convite:' : 'Coloco na agenda?',
      sub: noTime,
      lines: lines(d),
      provenance: fromPrint ? 'inference' : undefined,
      action: { mode: 'confirm', label: 'Adicionar à agenda', done: `${d.title} adicionado ✓ ${when(d)}`, run: () => createCalendarEvent(d, 'lumos').undo },
    }
  return {
    area: AREA,
    text: `${d.title} adicionado ✓ ${when(d)}`,
    sub: noTime,
    lines: d.location ? lines(d) : undefined,
    provenance: fromPrint ? 'inference' : undefined,
    action: { mode: policyFor('personal_schedule'), run: () => createCalendarEvent(d, 'lumos').undo },
  }
}

function calendar(input: HandlerInput): LumosReply | undefined {
  const { db, n, text, now, attachment } = input
  if (attachment) {
    if (attachment.category !== 'event' || !attachment.event) return undefined
    // The print gives the event; her sentence gives the intent (and may correct the day: "coloca isso sábado").
    const spoken = n ? eventDraftFromText(text, now.date) : undefined
    const d: EventDraft = { ...attachment.event, sourceAttachment: { name: attachment.name, kind: attachment.kind } }
    if (spoken?.date && (!d.date || d.missing.includes('month'))) {
      d.date = spoken.date
      d.missing = d.missing.filter((f) => f !== 'month' && f !== 'date')
    }
    if (spoken?.startTime && !d.startTime) {
      d.startTime = spoken.startTime
      d.missing = d.missing.filter((f) => f !== 'time')
    }
    return calendarReply(input, d, SAVE.test(n) && draftComplete(d))
  }
  if (!n || SKIP.test(n) || !looksLikeEvent(text)) return undefined
  // Trainings belong to the training planner ("adiciona yoga sábado").
  if (lex(db, text, now.date).mods.length) return undefined
  const d = eventDraftFromText(text, now.date)
  if (!d.date && !d.missing.includes('month') && !SAVE.test(n)) return undefined
  return calendarReply(input, d, draftComplete(d))
}

export const calendarHandler: Handler = { id: 'calendar', run: calendar }
