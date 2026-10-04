/**
 * "meu inglês", "a leitura", "o banho", "a natação" → entries of ONE day's timeline (data/timeline.ts).
 *
 * Words come from the data only: entry titles, modality words of trainings, fuel phases of plan
 * meals, and study tracks (a track's name ↔ its formats, so "inglês" finds a calendar event called
 * "Cambly" and vice-versa). No names of places, people or services live here.
 */
import { contextWorkouts } from '@/data/fuel'
import { findModality } from '@/data/planning'
import { dayTimeline, flatten, startMin } from '@/data/timeline'
import type { DateKey, DayPeriod, DB, TimeHM, TimelineEntry } from '@/data/types'
import { hmToMinutes } from '@/lib/date'
import { modalityWords, tokenizeAdjust } from '../adjust/lexicon'

/** Words of a sentence that never identify a thing on the day. */
const STOP = new Set([
  'amanha', 'hoje', 'depois', 'antes', 'minha', 'minhas', 'meus', 'nesta', 'neste', 'nessa', 'nesse', 'essa', 'esse', 'esta', 'este', 'isso',
  'coloca', 'colocar', 'coloque', 'bota', 'botar', 'joga', 'jogar', 'passa', 'passar', 'muda', 'mudar', 'move', 'mover', 'empurra', 'adia', 'adiar', 'antecipa',
  'cancelei', 'cancela', 'cancelar', 'cancelo', 'cancelado', 'cancelada', 'cancelou', 'quero', 'queria', 'vou', 'fazer', 'faco', 'nao', 'tira', 'tirar', 'tirei',
  'pula', 'pular', 'pulo', 'acordar', 'acordei', 'acordo', 'agora', 'agorinha', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo', 'feira',
  'manha', 'tarde', 'noite', 'cedo', 'cedinho', 'horas', 'hora', 'proxima', 'proximo', 'pra', 'para', 'pro', 'pelo', 'pela', 'cria', 'criar', 'crie', 'adiciona',
  'adicionar', 'inclui', 'incluir', 'checklist', 'lista', 'lembra', 'lembrete', 'lembrar', 'dia', 'vai', 'ter', 'tem', 'meu', 'marca', 'marcar', 'deixa', 'deixar',
  'fica', 'ficar', 'coisa', 'semana', 'que', 'vem', 'com', 'sem', 'mais', 'por', 'favor', 'aqui', 'ali', 'lumos', 'mari', 'aula', 'dos', 'das', 'nos', 'nas', 'uma', 'umas', 'uns',
  'tambem', 'so', 'ate', 'apos', 'vez', 'lugar',
])
const TITLE_STOP = new Set(['com', 'dos', 'das', 'para', 'pra', 'pro', 'uma', 'session', 'sessao', 'quando', 'fizer', 'pegar'])

const stem = (w: string) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)

export function same(a: string, b: string): boolean {
  const x = stem(a)
  const y = stem(b)
  if (x === y) return true
  return x.length >= 5 && y.length >= 5 && (x.startsWith(y) || y.startsWith(x))
}

/** The words of a sentence part that can name something (no verbs, days, times…). */
export function queryWords(text: string): string[] {
  return tokenizeAdjust(text).filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d/.test(t))
}

function titleWords(title: string): string[] {
  return tokenizeAdjust(title).filter((t) => t.length >= 3 && !TITLE_STOP.has(t))
}

/** Study tracks as alias groups: name + formats ("Inglês" ↔ "Cambly", "conversação"). */
function aliasGroups(db: DB): string[][] {
  return (db.studyTracks ?? []).map((t) => [...titleWords(t.name), ...(t.formats ?? []).flatMap(titleWords)]).filter((g) => g.length > 0)
}

/** Alias groups only widen calendar events and tasks (study things live there), never routine/meals. */
const ALIASED = new Set<TimelineEntry['kind']>(['event', 'task'])

function entryWords(db: DB, date: DateKey, e: TimelineEntry): string[] {
  const words = titleWords(e.title)
  if (e.kind === 'workout') {
    const w = contextWorkouts(db, date).find((x) => x.id === e.ref.id || x.templateId === e.ref.id)
    const mods = w ? [w.modality] : (db.weekTemplate.find((t) => t.id === e.ref.id)?.modalities ?? [])
    for (const id of mods) {
      const m = findModality(db.profile, id)
      if (m) words.push(...modalityWords(m))
    }
    words.push('treino')
  }
  if (e.kind === 'meal' && e.phase && e.phase !== 'refeicao') words.push(e.phase === 'pre' ? 'pretreino' : e.phase === 'pos' ? 'postreino' : 'intra')
  return [...new Set(words)]
}

function aliasWords(words: string[], groups: string[][]): string[] {
  return [...new Set(groups.filter((g) => g.some((a) => words.some((w) => same(a, w)))).flat())]
}

/** Lenient parts of the day for "de manhã" / "à noite" (05:20 is still morning). */
const LOOSE_PERIOD: Record<DayPeriod, [number, number]> = { manha: [0, 12 * 60], almoco: [11 * 60, 15 * 60], tarde: [12 * 60, 18 * 60 + 30], noite: [17 * 60, 24 * 60] }

export interface FindOptions {
  /** Kinds that can't be the answer (e.g. 'work' — BASE hours are information, not editable). */
  exclude?: TimelineEntry['kind'][]
  /** "de manhã": keep entries that start inside that period. */
  period?: DayPeriod
  /** "às 5h10": with several candidates, the one already closest to it wins (when clearly closer). */
  near?: TimeHM
  /** Include entries already cancelled that day. */
  includeCancelled?: boolean
}

export type Found = { ok: TimelineEntry } | { many: TimelineEntry[] } | { none: true }

/** Best matches for `words` on `date`. Step rows (Higiene → "Raspar língua") only count when no group row matches. */
export function findOnDay(db: DB, date: DateKey, words: string[], opts: FindOptions = {}): Found {
  if (!words.length) return { none: true }
  const groups = aliasGroups(db)
  const top = dayTimeline(db, date)
  const exclude = new Set<TimelineEntry['kind']>(['work', ...(opts.exclude ?? [])])
  const children = new Set(top.flatMap((e) => e.children ?? []))
  let pool = flatten(top).filter((e) => !exclude.has(e.kind) && (opts.includeCancelled || e.status !== 'cancelled'))
  if (opts.period) {
    const [a, b] = LOOSE_PERIOD[opts.period]
    pool = pool.filter((e) => {
      const s = startMin(e)
      return s === undefined || (s >= a && s < b)
    })
  }
  const scored = pool
    .map((e) => {
      const ew = entryWords(db, date, e)
      const aw = ALIASED.has(e.kind) ? aliasWords(ew, groups) : []
      // A word in the title counts double; an alias ("inglês" for a "Cambly" event) counts once.
      const hits = words.reduce((n, w) => n + (ew.some((x) => same(w, x)) ? 2 : aw.some((x) => same(w, x)) ? 1 : 0), 0)
      return { e, s: hits ? hits - (children.has(e) ? 0.5 : 0) : 0 }
    })
    .filter((x) => x.s > 0)
  if (!scored.length) return { none: true }
  const best = Math.max(...scored.map((x) => x.s))
  let list = scored.filter((x) => x.s === best).map((x) => x.e)
  // The same row twice (a group and its only step with the same title) → the group.
  list = list.filter((e, i) => list.findIndex((x) => x.title === e.title && x.start === e.start) === i)
  if (list.length > 1 && opts.near) {
    const t = hmToMinutes(opts.near)
    const byDist = [...list].sort((a, b) => Math.abs((startMin(a) ?? 9999) - t) - Math.abs((startMin(b) ?? 9999) - t))
    const d0 = Math.abs((startMin(byDist[0]) ?? 9999) - t)
    const d1 = Math.abs((startMin(byDist[1]) ?? 9999) - t)
    if (d0 + 180 <= d1) return { ok: byDist[0] }
  }
  return list.length === 1 ? { ok: list[0] } : { many: list }
}

/** Her own spelling of the words ("meditação", not "meditacao") for questions and answers. */
export function spoken(text: string, words: string[]): string {
  const raw = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.map((w) => raw.find((r) => tokenizeAdjust(r)[0] === w) ?? w).join(' ')
}
