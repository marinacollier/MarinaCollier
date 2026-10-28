/**
 * The Expedição by conversation, while a trip with expedition settings is happening (dates in the trip):
 *   "hoje faltei aula"                              → an absence item for the class day (school counter)
 *   "fiz o surf no muz de manhã, amei"              → the planned trip item is done today (moved if it was another
 *                                                     day) + the training is registered; nothing else is touched
 *   "gastei 1500 zar e 250 zar de alimentação"      → paid values in ZAR on the day's activity / a food item
 *   "300 zar de uber ida e volta"                   → uber kept apart from the activity cost
 *   "a tarde irei na lions"                         → that item is confirmed for the day
 * Several of these in one message become ONE action (one Desfazer). Nothing is converted to BRL here.
 */
import { getDB } from '@/data/store'
import type { DateKey, DB, Trip, TripItem } from '@/data/types'
import { formatDayMonth } from '@/lib/date'
import { normalize } from '@/lib/text'
import { formatMoney, isActive } from '@/features/travel/expedition/logic'
import { lex } from '../../adjust/lexicon'
import { createUndoable, eventDraft, runLogged, updateUndoable } from '../log'
import type { LifeEventDraft } from '@/data/intel'
import { policyFor } from '../policy'
import { dayIn } from '../text'
import type { Handler, HandlerInput, LumosReply, ReplyLine, Undo } from '../types'

const AREA = 'viagem'

/** The trip with expedition settings happening on that day. */
export function activeExpedition(db: DB, date: DateKey): Trip | undefined {
  return db.trips.find((t) => t.expedition && t.startDate && t.endDate && t.startDate <= date && date <= t.endDate)
}

/** Letters and digits only ("Lion's Head" → "lionshead"), so "lions" finds it. */
const flat = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '')
/** Short local names she uses. */
const NICKNAMES: Record<string, string> = { muz: 'muizenberg', muiz: 'muizenberg', lions: 'lionshead', lion: 'lionshead', table: 'tablemountain', kirsten: 'kirstenbosch' }
const STOP = new Set(['hoje', 'amanha', 'tarde', 'manha', 'noite', 'fiz', 'foi', 'incrivel', 'amei', 'irei', 'vou', 'ida', 'volta', 'gastei', 'paguei', 'zar', 'rand', 'rands', 'aula', 'escola', 'faltei', 'para', 'pra', 'pro', 'com', 'que', 'nao', 'sei', 'escrever', 'kkkkk', 'kkk', 'kkkk', 'mim', 'app', 'atualiza'])

/** Words of a phrase that can name a trip item. */
function keyWords(phrase: string): string[] {
  return normalize(phrase)
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/'/g, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => NICKNAMES[w] ?? w)
}

/** Best trip item named by these words (title or address), preferring the given day, then the closest one. */
function findItem(items: TripItem[], words: string[], date: DateKey, pred: (i: TripItem) => boolean = () => true): TripItem | undefined {
  const scored = items
    .filter((i) => isActive(i) && pred(i))
    .map((i) => {
      const hay = flat(`${i.title} ${i.address ?? ''} ${i.checklistKind ?? ''}`)
      const hits = words.filter((w) => hay.includes(w)).length
      const dist = i.date ? Math.abs(Date.parse(i.date) - Date.parse(date)) / 864e5 : 99
      return { i, hits, dist }
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.dist - b.dist)
  return scored[0]?.i
}

const DID = /\b(?:surfei|corri|nadei|pedalei|fiz\b[^.!?;]{0,30}?\b(?:surf|trilha|corrida|caiaque|bike|pedal|mergulho|snorkel|parapente)|subi\s+(?:o |a )?\S+)/
const MISSED = /\b(?:faltei (?:a |na |à )?(?:aula|escola)|nao fui (?:a |na |pra |para )?(?:aula|escola)|matei (?:a )?aula)\b/
const GOING = /\b(?:vou|irei|iremos|vamos|vou fazer|vou subir)\s+(?:(?:na|no|ao|a|pra|pro|para|o|fazer|subir)\s+)?(?:(?:na|no|o|a)\s+)?([a-z][a-z' ]{2,40})/
const LOVED = /\b(amei|incrivel|maravilhos[oa]|perfeito|demais)\b/
const MONEY = /(\d+(?:[.,]\d+)?)\s*(?:zar|rands?|r\s?(?=\d))\b/g

interface Spend {
  cents: number
  purpose: 'uber' | 'comida' | 'atividade'
  what: string
}

/** Every "N zar (de X)" of the sentence, with what follows it until the next amount or comma. */
export function readSpends(n: string): Spend[] {
  const out: Spend[] = []
  const matches = [...n.matchAll(MONEY)]
  matches.forEach((m, k) => {
    const after = n.slice(m.index! + m[0].length, k + 1 < matches.length ? matches[k + 1].index : undefined)
    const before = n.slice(Math.max(0, m.index! - 25), m.index!)
    const what = after.split(/[,.;]|\be\s+(?=\d)/)[0].replace(/^\s*(?:e\s+)?(?:de|do|da|no|na|com|em|pro|pra)\s+/, '').replace(/(?:^|\s+)e\s*$/, '').trim()
    const ctx = `${what} ${before.split(/[,.;]/).pop() ?? ''}`
    const purpose = /\b(uber|bolt|taxi)\b/.test(ctx) ? 'uber' : /\b(aliment|comida|almoc|jant|cafe|lanche|refeic)/.test(ctx) ? 'comida' : 'atividade'
    const cents = Math.round(Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) * 100)
    if (cents > 0) out.push({ cents, purpose, what })
  })
  return out
}

function trip(input: HandlerInput): LumosReply | undefined {
  const { db, n, text, now } = input
  const t = activeExpedition(db, now.date)
  if (!t) return undefined
  const missed = MISSED.test(n)
  const did = DID.exec(n)
  const spends = readSpends(n)
  const going = GOING.exec(n)
  if (!missed && !did && !spends.length && !going) return undefined
  // A sentence about the trip needs at least one concrete piece it can write; otherwise other handlers answer.
  const date = dayIn(n, now.date) ?? now.date
  const items = db.tripItems.filter((i) => i.tripId === t.id)
  const cur = t.expedition!.currency
  const lines: ReplyLine[] = []
  const writes: { run: () => Undo; event?: LifeEventDraft }[] = []

  // ── what she did (sentence before "gastei"/"a tarde", so "lions" later isn't taken as the surf) ──
  let doneItem: TripItem | undefined
  if (did) {
    const clause = n.slice(did.index).split(/\bgastei\b|\bpaguei\b|\ba tarde\b|\bde tarde\b|\bmais tarde\b|\.|;/)[0]
    const words = keyWords(clause.replace(/^fiz\b/, '').replace(/^surfei/, 'surf').replace(/^corri/, 'corrida').replace(/^nadei/, 'natacao').replace(/^pedalei/, 'bike'))
    doneItem = findItem(items, words, date, (i) => i.status !== 'feito' && i.section !== 'voo' && i.section !== 'hospedagem')
    const loved = LOVED.test(clause) || LOVED.test(n)
    if (doneItem) {
      const it = doneItem
      const moved = it.date && it.date !== date ? it.date : undefined
      const morning = /\bde manha\b|\bcedo\b/.test(n)
      const note = [it.notes, `${loved ? 'Amei! ' : ''}Feito em ${formatDayMonth(date)}${moved ? ` (estava para ${formatDayMonth(moved)})` : ''}.`].filter(Boolean).join('\n')
      writes.push({
        run: () => updateUndoable('tripItems', it.id, { status: 'feito', certainty: 'confirmado', date, ...(moved && it.endDate === moved ? { endDate: date } : {}), ...(morning && it.time && it.time >= '12:00' ? { time: undefined } : {}), notes: note }),
        event: eventDraft(now, { kind: 'done', title: `Viagem: ${it.title}${loved ? ' — amei' : ''}`, area: 'viagens', ref: { type: 'tripItem', id: it.id } }),
      })
      lines.push({ emoji: '✓', text: `${it.title} feito ${date === now.date ? 'hoje' : formatDayMonth(date)}${loved ? ' — que bom que você amou!' : ''}`, sub: moved ? `Estava para ${formatDayMonth(moved)}; esse dia ficou livre.` : undefined })
      // The training too (Corpo), when the activity is a modality she has.
      const mod = lex(db, text, now.date).mods[0]
      const already = db.workouts.some((w) => w.date === date && w.modality === mod?.id && w.status === 'feito')
      if (mod && !already) {
        const m = db.profile.modalities.find((x) => x.id === mod.id)
        writes.push({ run: () => createUndoable('workouts', { date, modality: mod.id, status: 'feito', notes: `${it.title}${loved ? ' · amei' : ''}`, order: db.workouts.filter((w) => w.date === date).length }).undo })
        if (m) lines.push({ emoji: m.emoji, text: `${m.label} registrado no Corpo` })
      }
    }
  }

  // ── missed class ──
  if (missed) {
    const already = items.some((i) => i.date === date && i.schoolImpact === 'dia' && isActive(i))
    if (!already) {
      writes.push({
        run: () => createUndoable('tripItems', { tripId: t.id, section: 'roteiro', group: 'Escola', title: 'Falta na escola', status: 'feito', certainty: 'confirmado', date, schoolImpact: 'dia', order: items.length }).undo,
        event: eventDraft(now, { kind: 'logged', title: `Faltou à aula (${formatDayMonth(date)})`, area: 'estudos' }),
      })
      lines.push({ emoji: '🏫', text: `Falta na escola em ${formatDayMonth(date)}`, sub: 'Entra no contador de aulas perdidas; dá para marcar como reposta depois.' })
    } else lines.push({ emoji: '🏫', text: `A falta de ${formatDayMonth(date)} já estava registrada` })
  }

  // ── money (ZAR) ──
  const dayDone = () => doneItem ?? items.find((i) => i.date === date && i.status === 'feito' && isActive(i) && !i.schoolImpact && i.section !== 'hospedagem')
  const food = items.find((i) => i.date === date && i.section === 'comida' && isActive(i))
  let foodAdd = 0
  let uberAdd = 0
  const actAdds: { item?: TripItem; cents: number; what: string }[] = []
  for (const s of spends) {
    if (s.purpose === 'comida') foodAdd += s.cents
    else if (s.purpose === 'uber') uberAdd += s.cents
    else {
      const named = s.what ? findItem(items, keyWords(s.what), date) : undefined
      actAdds.push({ item: named ?? dayDone(), cents: s.cents, what: s.what })
    }
  }
  for (const a of actAdds) {
    const it = a.item
    if (it) {
      writes.push({ run: () => { const cur0 = getDB().tripItems.find((x) => x.id === it.id); return updateUndoable('tripItems', it.id, { paidCents: (cur0?.paidCents ?? 0) + a.cents, currency: it.currency ?? cur, booking: it.booking === 'cancelado' ? it.booking : 'concluido' }) } })
      lines.push({ emoji: '💸', text: `${formatMoney(a.cents, cur)} pagos em ${it.title}` })
    } else {
      const title = a.what ? a.what.charAt(0).toUpperCase() + a.what.slice(1) : 'Gasto do dia'
      writes.push({ run: () => createUndoable('tripItems', { tripId: t.id, section: 'roteiro', title, status: 'feito', date, paidCents: a.cents, currency: cur, order: items.length }).undo })
      lines.push({ emoji: '💸', text: `${formatMoney(a.cents, cur)} · ${title}` })
    }
  }
  if (foodAdd) {
    if (food) writes.push({ run: () => updateUndoable('tripItems', food.id, { paidCents: (food.paidCents ?? 0) + foodAdd, currency: food.currency ?? cur }) })
    else writes.push({ run: () => createUndoable('tripItems', { tripId: t.id, section: 'comida', title: 'Alimentação', status: 'feito', date, paidCents: foodAdd, currency: cur, order: items.length }).undo })
    lines.push({ emoji: '🍽', text: `${formatMoney(foodAdd, cur)} de alimentação` })
  }
  if (uberAdd) {
    const ride = dayDone()
    if (ride) writes.push({ run: () => { const cur0 = getDB().tripItems.find((x) => x.id === ride.id); return updateUndoable('tripItems', ride.id, { uberCents: (cur0?.uberCents ?? 0) + uberAdd, currency: ride.currency ?? cur }) } })
    else writes.push({ run: () => createUndoable('tripItems', { tripId: t.id, section: 'transporte', title: 'Uber', status: 'feito', date, uberCents: uberAdd, currency: cur, order: items.length }).undo })
    lines.push({ emoji: '🚗', text: `${formatMoney(uberAdd, cur)} de Uber${ride ? ` (${ride.title}, separado do custo)` : ''}` })
  }
  if (spends.length) writes.push({ run: () => () => {}, event: eventDraft(now, { kind: 'logged', title: `Gastos da viagem: ${formatMoney(spends.reduce((s, x) => s + x.cents, 0), cur)}`, area: 'financas' }) })

  // ── what she is going to do ──
  if (going) {
    const words = keyWords(going[1])
    const it = findItem(items, words, date, (i) => i.status !== 'feito' && i.id !== doneItem?.id)
    if (it) {
      const when = it.date === date || !it.date ? date : it.date
      const tz = it.time ? ` às ${it.time}` : ''
      writes.push({ run: () => updateUndoable('tripItems', it.id, { status: 'confirmado', certainty: it.clearance === 'pendente' ? it.certainty : 'confirmado', date: when }) })
      const sub = [it.leaveTime ? `Sair ${it.leaveTime}` : undefined, it.returnTime ? `voltar ${it.returnTime}` : undefined, it.risk].filter(Boolean).join(' · ') || undefined
      lines.push({ emoji: '📍', text: `${it.title} ${when === now.date ? 'hoje' : formatDayMonth(when)}${tz} confirmado`, sub })
    }
  }

  if (!writes.length) return undefined
  const runAll = (): Undo => {
    const undos: Undo[] = []
    const events: LifeEventDraft[] = []
    for (const w of writes) if (w.event) events.push(w.event)
    undos.push(runLogged(() => {
      const inner = writes.map((w) => w.run())
      return () => inner.reverse().forEach((u) => u())
    }, events))
    return () => undos.forEach((u) => u())
  }
  const total = spends.reduce((s, x) => s + x.cents, 0)
  return {
    area: AREA,
    text: `Atualizei a ${t.name} ✓`,
    sub: total ? `Hoje: ${formatMoney(total, cur)} registrados. Sem conversão para real enquanto não houver cotação sua.` : undefined,
    lines,
    ref: { type: 'trip', id: t.id },
    action: { mode: policyFor('personal_schedule'), run: runAll },
  }
}

export const tripHandler: Handler = { id: 'trip', run: trip }
