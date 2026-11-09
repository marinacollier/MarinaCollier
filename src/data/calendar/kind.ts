/**
 * Tipo — what a dated thing IS (reunião, aula, treino, tarefa…), whatever record it lives in.
 *
 * Derived, never migrated: from the source type, the trip item's section/checklist/title, the event's
 * life kind/category, the task's context/links. Her explicit retag (`entryKind` on the record) always wins.
 * The tipo decides which quick actions and which editor fit: booking vocabulary (A COTAR, RESERVA EMITIDA,
 * pagamento) belongs to 'reserva' only.
 *
 *   tripItemKind({ section: 'roteiro', title: 'Conversa com Hillary', … }) → 'reuniao'
 *   tripItemKind({ section: 'voo', title: 'GRU → CPT', … })               → 'reserva'
 */
import type { CalendarEvent, DB, EntryKind, Task, TripItem } from '../types'
import { isSchoolAbsence } from '../travel-mode'
import type { CalendarEntry } from './universal'

export const KIND_META: Record<EntryKind, { label: string }> = {
  reuniao: { label: 'Reunião' },
  aula: { label: 'Aula' },
  treino: { label: 'Treino' },
  tarefa: { label: 'Tarefa' },
  trabalho: { label: 'Projeto · trabalho' },
  estudo: { label: 'Estudo' },
  ugc: { label: 'UGC · parceria' },
  reserva: { label: 'Reserva · passeio' },
  pessoal: { label: 'Pessoal' },
  espiritualidade: { label: 'Espiritualidade' },
}

export const KIND_ORDER: EntryKind[] = ['reuniao', 'tarefa', 'trabalho', 'estudo', 'aula', 'treino', 'ugc', 'reserva', 'pessoal', 'espiritualidade']

const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const MEETING_RE = /\b(reuniao|reunioes|call|meeting|meet|conversa|conversar|alinhamento|entrevista|bate[- ]papo|1:1|one[- ]on[- ]one|mentoria|sync)\b/
const SPIRIT_RE = /\b(missa|igreja|culto|oracao|orar|retiro|meditacao|meditar|terco|devocional|espiritualidade)\b/
const CLASS_RE = /\b(aula|aulas|class|curso|workshop|palestra)\b/
const STUDY_RE = /\b(estudar|estudo|revisar|revisao|licao|homework|ingles|leitura)\b/
const UGC_RE = /\b(ugc|publi|publipost|parceria|reels?|gravar|gravacao|conteudo|post|stories|tiktok)\b/
const RESERVABLE: TripItem['section'][] = ['voo', 'hospedagem', 'transporte', 'reserva']
const WORKOUT_CHECKLISTS: TripItem['checklistKind'][] = ['trilha', 'corrida', 'natacao', 'surf', 'bike', 'scuba']

/** Keyword tipo from a title (or undefined when the title says nothing). Meeting words win. */
export function titleKind(title: string): EntryKind | undefined {
  const t = fold(title)
  if (MEETING_RE.test(t)) return 'reuniao'
  if (SPIRIT_RE.test(t)) return 'espiritualidade'
  if (CLASS_RE.test(t)) return 'aula'
  if (UGC_RE.test(t)) return 'ugc'
  if (STUDY_RE.test(t)) return 'estudo'
  return undefined
}

/** Money, supplier or proof on the item: someone sells it → a booking, not a workout. */
const hasBookingTrace = (i: Partial<TripItem>) =>
  !!(i.supplier?.trim() || i.voucherUrl?.trim() || i.confirmationCode?.trim() || i.proof?.trim() || i.amountCents || i.estimatedCents || i.quotedCents || i.paidCents || (i.bookingStatus && i.bookingStatus !== 'planejado') || i.paymentStatus === 'pago' || i.paymentStatus === 'pendente')

export function tripItemKind(i: Pick<TripItem, 'section' | 'title'> & Partial<TripItem>): EntryKind {
  if (i.entryKind) return i.entryKind
  if (i.id && isSchoolAbsence({ id: i.id, group: i.group, title: i.title, schoolImpact: i.schoolImpact })) return 'aula'
  if (RESERVABLE.includes(i.section)) return 'reserva'
  const byTitle = titleKind(i.title)
  if (byTitle) return byTitle
  // Community work is a conversation/meeting with people (Hillary), not something she books.
  if (i.checklistKind === 'voluntariado' && i.volunteer !== 'visita_educativa') return 'reuniao'
  if (i.section === 'esporte' || WORKOUT_CHECKLISTS.includes(i.checklistKind)) return hasBookingTrace(i) ? 'reserva' : 'treino'
  switch (i.section) {
    case 'mala':
    case 'comprar':
    case 'documento':
    case 'antes_de_ir':
      return 'tarefa'
    default:
      return 'reserva' // roteiro / quero_ir / comida: passeios and places she may book
  }
}
export function eventKind(e: Pick<CalendarEvent, 'title'> & Partial<CalendarEvent>): EntryKind {
  if (e.entryKind) return e.entryKind
  const byTitle = titleKind(e.title)
  if (byTitle) return byTitle
  const cat = fold(e.category ?? '')
  if (/espirit|\bfe\b|igreja/.test(cat)) return 'espiritualidade'
  switch (e.kind) {
    case 'treino':
      return 'treino'
    case 'estudo':
      return 'estudo'
    case 'trabalho':
      return 'trabalho'
    case 'viagem':
      return /\b(voo|hotel|hospedagem|check-?in|transfer|passeio|tour)\b/.test(fold(e.title)) ? 'reserva' : 'pessoal'
  }
  if (/trabalho|carreira/.test(cat) || e.projectId) return 'trabalho'
  if (/estudo/.test(cat)) return 'estudo'
  return 'pessoal'
}

export function taskKind(t: Pick<Task, 'title'> & Partial<Task>): EntryKind {
  if (t.entryKind) return t.entryKind
  if (MEETING_RE.test(fold(t.title))) return 'reuniao'
  if (t.brandId || t.contentItemId || t.partnershipId || t.context === 'conteudo' || t.area === 'conteudo' || t.tags?.some((g) => /^(ugc|parceria)$/i.test(g))) return 'ugc'
  if (t.context === 'estudo' || t.area === 'estudo') return 'estudo'
  return 'tarefa'
}

/** The tipo of a calendar entry, from its source record when there is one. */
export function kindOfEntry(db: DB, e: CalendarEntry): EntryKind {
  switch (e.sourceType) {
    case 'school':
      return 'aula'
    case 'workout':
      return 'treino'
    case 'meeting':
      return 'reuniao'
    case 'event': {
      const ev = db.events.find((x) => x.id === e.sourceId)
      return ev ? eventKind(ev) : 'pessoal'
    }
    case 'task':
    case 'taskDeadline':
    case 'waiting': {
      const t = db.tasks.find((x) => x.id === e.sourceId)
      return t ? taskKind(t) : 'tarefa'
    }
    case 'tripItem':
    case 'tripDeadline': {
      const i = db.tripItems.find((x) => x.id === e.sourceId)
      return i ? tripItemKind(i) : 'reserva'
    }
    case 'trip':
      return 'reserva'
    case 'content':
    case 'partnership':
    case 'ugcFollowUp':
      return 'ugc'
    case 'work':
    case 'milestone':
    case 'delivery':
    case 'opportunity':
    case 'contact':
    case 'receivable':
      return 'trabalho'
    case 'bill':
      return 'tarefa'
    case 'petTask':
    case 'petBirthday':
      return 'pessoal'
    case 'dayBlock':
      return e.category === 'trabalho' ? 'trabalho' : e.category === 'estudo' ? 'estudo' : e.category === 'treino' ? 'treino' : 'pessoal'
  }
}
